// voting_contract_fixed_final.cairo
// A fully automated voting contract with 48-hour cycles
// Each cycle: 24h Voting → 12h Counting → 12h Results → repeat

// ============================================================
// GLOBAL IMPORTS
// ============================================================

use starknet::ContractAddress; // Brings ContractAddress type into scope for the entire file

// ============================================================
// ENUM (Must be before interface)
// ============================================================

// These attributes derive necessary traits for the enum:
// - Copy: can be copied, not just moved
// - Drop: can be dropped/destroyed
// - PartialEq: can be compared for equality
// - Serde: can be serialized/deserialized (needed for ABI)
// - starknet::Store: can be stored in contract storage
#[derive(Copy, Drop, PartialEq, Serde, starknet::Store)]
// This attribute silences a warning about enum variants not having associated data
#[allow(starknet::store_no_default_variant)]
enum ElectionStages {
    Voting, // Phase 1: First 24 hours - users can vote, results hidden
    Tallying, // Phase 2: Next 12 hours (24-36h) - voting closed, results still hidden
    Results // Phase 3: Final 12+ hours (36-48h+) - results visible
}

// ============================================================
// INTERFACE
// ============================================================

// This interface defines the public API of the contract.
// It's used to generate the dispatcher (ABI) for external calls.
// The dispatcher allows frontend and tests to interact with the contract.
#[starknet::interface]
pub trait IZkVoting<T> {
    // Core state-changing functions
    fn vote(ref self: T, candidate_id: u32); // Cast a vote
    fn advance_to_next_election_round(ref self: T); // Manually advance after 48h
    fn update_candidates(ref self: T, new_candidates: Array<felt252>); // Owner updates candidates

    // View functions (read-only, no state change)
    fn get_election_phase(self: @T) -> ElectionStages; // Returns current phase
    fn get_round_winner(self: @T) -> (u32, u64, felt252); // Returns (winner_id, votes, name)
    fn get_candidate(self: @T, candidate_id: u32) -> felt252; // Get candidate name by ID
    fn get_total_candidate_nums(self: @T) -> u32; // Get total number of candidates
    fn get_current_election_round(self: @T) -> u32; // Get current round number
    fn get_owner(self: @T) -> ContractAddress; // Get contract owner address
    fn get_every_round_start_time(self: @T) -> u64; // Get timestamp when current round started
    fn get_total_votes(
        self: @T, cycle: u32, candidate_id: u32,
    ) -> u64; // Get votes for specific cycle/candidate
}

// ============================================================
// CONTRACT
// ============================================================

#[starknet::contract]
mod ZkVoting {
    // Bring external types and traits into this module's scope
    use starknet::ContractAddress; // Type for wallet/contract addresses
    use starknet::get_block_timestamp; // Function to get current blockchain time
    use starknet::storage::Map; // Key-value storage mapping type
    use starknet::storage::StorageMapReadAccess; // Trait for .read() on Map storage
    use starknet::storage::StorageMapWriteAccess; // Trait for .write() on Map storage
    use starknet::storage::StoragePointerReadAccess; // Trait for .read() on simple storage
    use starknet::storage::StoragePointerWriteAccess; // Trait for .write() on simple storage
    use super::{ElectionStages}; // Import the enum from parent module

    // ============================================================
    // STORAGE - All persistent contract data lives here
    // ============================================================
    #[storage]
    struct Storage {
        // === CYCLE TRACKING ===
        // Address of the contract deployer (has special privileges)
        owner: ContractAddress,
        // Unix timestamp (seconds since Jan 1, 1970) when current cycle started
        // Used to calculate which phase (Voting/Tallying/Results) we're in
        every_round_start_time: u64,
        // Current cycle/round number (1, 2, 3...)
        // Increments when advance_to_next_election_round() is called after 48 hours
        current_round_number: u32,
        // === VOTE TRACKING ===
        // Tracks whether a specific user has voted in a specific cycle
        // Key: (voter_address, cycle_number) -> Value: true if voted
        // Prevents double voting in the same round
        has_voted: Map<(ContractAddress, u32), bool>,
        // Stores vote counts for each candidate in each cycle
        // Key: (cycle_number, candidate_id) -> Value: number of votes
        // Allows storing results for all cycles permanently
        Total_votes: Map<(u32, u32), u64>,
        // === CANDIDATE INFO ===
        // Stores candidate names by their ID
        // Key: candidate_id (0, 1, 2...) -> Value: candidate name as felt252
        // Note: Same candidates run in EVERY cycle unless updated by owner
        candidates_identification: Map<u32, felt252>,
        // Total number of candidates in this election
        // Used for validation (ensuring candidate_id exists) and iteration
        // Must be kept in sync with candidates_identification map
        total_candidate_nums: u32,
    }

    // ============================================================
    // CONSTRUCTOR - Runs ONCE when contract is deployed
    // ============================================================
    #[constructor]
    pub fn constructor(ref self: ContractState, candidates: Array<felt252>) {
        // 1. OWNER: Saves who deployed the contract
        // The caller address becomes the owner (special privileges for updates)
        self.owner.write(starknet::get_caller_address());

        // 2. START TIME: Records when contract was deployed
        // This marks the beginning of Cycle 1, used for all future time calculations
        self.every_round_start_time.write(get_block_timestamp());

        // 3. ROUND NUMBER: First election round is 1
        // Starts counting from 1 for better readability
        self.current_round_number.write(1);

        // 4. CANDIDATES: Loops through input array and stores each
        let mut candidate_index = 0; // Counter for candidate IDs (0, 1, 2...)
        let mut candidates_arr = candidates; // Mutable copy of the input array

        // Loop until we've processed all candidates
        // by getting their numbers as we remove them one by one
        loop {
            // Try to remove and get the first element from the array
            match candidates_arr.pop_front() {
                // If there's a candidate name...
                Option::Some(candidate_name) => {
                    // Store the candidate with current index as ID
                    // Example: ID 0 -> "DeFi", ID 1 -> "CeFi"
                    self.candidates_identification.write(candidate_index, candidate_name);
                    // Increment ID counter for the next candidate
                    candidate_index += 1;
                },
                // If array is empty, exit the loop
                Option::None => { break; },
            }
        }

        // 5. TOTAL COUNT: Saves how many candidates were added
        // candidate_index now equals the number of candidates processed
        // This is used for validation (e.g., checking candidate_id exists)
        self.total_candidate_nums.write(candidate_index);
    }

    // ============================================================
    // INTERNAL FUNCTION - Helper logic not exposed in ABI
    // ============================================================

    /// Determines what phase a specific cycle is in
    /// Returns: 'Voting', 'Tallying', or 'Results'
    /// This function is called by external view functions to determine current phase
    fn which_election_stage(self: @ContractState, cycle: u32) -> ElectionStages {
        // Get timestamp when this cycle started
        let cycle_start = self.every_round_start_time.read();
        // Get current cycle number
        let current_cycle = self.current_round_number.read();

        // CASE 1: This is a PAST cycle (already finished)
        if cycle < current_cycle {
            // Past cycles always show Results (transparency for auditing)
            return ElectionStages::Results;
        } // CASE 2: This is the CURRENT active cycle
        else if cycle == current_cycle {
            // Calculate how far into this cycle we are (in seconds)
            let current_time = get_block_timestamp();
            let time_in_cycle = current_time - cycle_start;

            // Determine phase based on elapsed time
            if time_in_cycle < 86400 { // Less than 24 hours
                ElectionStages::Voting // Phase 1: Users can vote
            } else if time_in_cycle < 86400 + 43200 { // Between 24-36 hours
                ElectionStages::Tallying // Phase 2: No voting, results hidden
            } else { // 36+ hours
                ElectionStages::Results // Phase 3: Results visible
            }
        } // CASE 3: Requested a future cycle (shouldn't happen normally)
        else {
            ElectionStages::Voting // Default to voting for safety
        }
    }

    // ============================================================
    // EXTERNAL FUNCTIONS IMPLEMENTATION - Public API
    // ============================================================

    #[abi(embed_v0)]
    pub impl ZkVotingImpl of super::IZkVoting<ContractState> {
        // ============================================================
        // vote() - Cast a vote for a candidate
        // ============================================================
        fn vote(ref self: ContractState, candidate_id: u32) {
            // STEP 1: Determine current phase
            // Use @self (snapshot) because which_election_stage only reads
            let phase = which_election_stage(@self, self.current_round_number.read());

            // STEP 2: Verify we're in Voting phase (first 24 hours)
            // If not, transaction fails with error message
            assert(phase == ElectionStages::Voting, 'Either wait or Advance round');

            // STEP 3: Get caller's wallet address
            // This identifies who is voting (prevents double voting)
            let caller = starknet::get_caller_address();
            // Get current cycle number (which round of election)
            let current_cycle = self.current_round_number.read();

            // STEP 4: Validate the vote
            // Check 1: Candidate must exist (candidate_id must be < total candidates)
            assert(candidate_id < self.total_candidate_nums.read(), 'Invalid candidate!...Boom!');

            // Check 2: User must not have already voted in THIS cycle
            assert(!self.has_voted.read((caller, current_cycle)), 'Already Voted!...Boom!');

            // STEP 5: Record the vote
            // Get current vote count for this candidate in this cycle
            let current_votes = self.Total_votes.read((current_cycle, candidate_id));

            // Increment vote count by 1
            self.Total_votes.write((current_cycle, candidate_id), current_votes + 1);

            // Mark that this user has voted in this cycle (prevents future double voting)
            self.has_voted.write((caller, current_cycle), true);
            // Note: No explicit return - successful transaction means vote counted
        }

        // ============================================================
        // advance_to_next_election_round() - Manually advance to next round
        // Called by anyone after 48+ hours have passed
        // ============================================================
        fn advance_to_next_election_round(ref self: ContractState) {
            // STEP 1: Get current blockchain time
            let current_time = get_block_timestamp();

            // STEP 2: Get when this cycle started
            let cycle_start = self.every_round_start_time.read();

            // STEP 3: Get current cycle number
            let current_cycle = self.current_round_number.read();

            // STEP 4: Verify that 48+ hours have passed
            // 86,400 seconds = 24 hours, so 86,400 * 2 = 172,800 seconds = 48 hours
            assert(current_time - cycle_start >= 86400 + 86400, 'Round is still active...Wait!');

            // STEP 5: Advance to next cycle
            let new_cycle = current_cycle + 1; // Increment cycle number
            self.every_round_start_time.write(current_time); // Reset start time to NOW
            self.current_round_number.write(new_cycle); // Save new cycle number
            // Note: Old votes remain in storage (transparency for past elections)
        }

        // ============================================================
        // update_candidates() - Owner updates the candidate list
        // Only callable:
        //   1. By the contract owner
        //   2. During Results phase (36-48+ hours)
        // ============================================================
        fn update_candidates(ref self: ContractState, new_candidates: Array<felt252>) {
            // STEP 1: Verify caller is the contract owner
            let caller = starknet::get_caller_address();
            assert(caller == self.owner.read(), 'You Are Not The Owner!...BOOM!');

            // STEP 2: Verify we're in Results phase (36+ hours into cycle)
            let which_phase = which_election_stage(@self, self.current_round_number.read());
            assert(which_phase == ElectionStages::Results, 'Wait For The Results Phase!');

            // STEP 3: Overwrite candidates identification mapping with new list
            let mut new_ID = 0; // Start IDs from 0
            let mut new_candidates_arr = new_candidates; // Mutable copy of input array

            // Loop through all new candidate names
            loop {
                match new_candidates_arr.pop_front() {
                    Option::Some(candidate_names) => {
                        // Store each candidate with sequential IDs (0, 1, 2...)
                        self.candidates_identification.write(new_ID, candidate_names);
                        new_ID += 1;
                    },
                    Option::None => { break; },
                }
            }

            // STEP 4: Update total candidate count
            self.total_candidate_nums.write(new_ID);
            // Note: Old votes for previous candidates remain in storage (transparency)
        }

        // ============================================================
        // get_election_phase() - Returns current phase (Voting/Tallying/Results)
        // Called by frontend to know if voting is allowed or results are visible
        // ============================================================
        fn get_election_phase(self: @ContractState) -> ElectionStages {
            // Delegate to internal helper function with current cycle number
            which_election_stage(self, self.current_round_number.read())
        }

        // ============================================================
        // get_round_winner() - Returns winner of current election round
        // Only available during Results phase (36+ hours)
        // Returns: (winner_id, winner_votes, winner_name)
        // ============================================================
        fn get_round_winner(self: @ContractState) -> (u32, u64, felt252) {
            // STEP 1: Get total number of candidates
            let total_candis = self.total_candidate_nums.read();

            // STEP 2: Get current round number
            let current_round = self.current_round_number.read();

            // STEP 3: Verify we're in Results phase (36+ hours)
            let win_phase = which_election_stage(self, current_round);
            assert(win_phase == ElectionStages::Results, 'Wait For The Results Phase!');

            // STEP 4: Find winner by looping through all candidates
            let mut winner_id = 0; // ID of candidate with most votes
            let mut max_votes = 0; // Highest vote count found
            let mut id_counting = 0; // Loop counter (0, 1, 2...)

            // Loop through each candidate
            while id_counting < total_candis {
                // Get vote count for this candidate in current round
                let votes_num = self.Total_votes.read((current_round, id_counting));

                // If this candidate has more votes than current max...
                if votes_num > max_votes {
                    max_votes = votes_num; // Update max votes
                    winner_id = id_counting; // Update winner ID
                }
                id_counting += 1; // Move to next candidate
            }

            // STEP 5: Get winner's name from candidates identification
            let winner_name = self.candidates_identification.read(winner_id);

            // STEP 6: Return winner info as tuple
            (winner_id, max_votes, winner_name)
        }

        // ============================================================
        // get_candidate() - Get candidate name by ID
        // Called by frontend to display candidate names
        // ============================================================
        fn get_candidate(self: @ContractState, candidate_id: u32) -> felt252 {
            // Simply read from candidates_identification map
            self.candidates_identification.read(candidate_id)
        }

        // ============================================================
        // get_total_candidate_nums() - Get total number of candidates
        // Used by frontend to know how many candidates to display/loop through
        // ============================================================
        fn get_total_candidate_nums(self: @ContractState) -> u32 {
            // Read directly from storage
            self.total_candidate_nums.read()
        }

        // ============================================================
        // get_current_election_round() - Get current cycle/round number
        // Used by frontend to display which election round is active
        // ============================================================
        fn get_current_election_round(self: @ContractState) -> u32 {
            self.current_round_number.read()
        }

        // ============================================================
        // get_owner() - Get contract owner address
        // Used for access control checks
        // ============================================================
        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        // ============================================================
        // get_every_round_start_time() - Get timestamp when current round started
        // Used for debugging and time calculations
        // ============================================================
        fn get_every_round_start_time(self: @ContractState) -> u64 {
            self.every_round_start_time.read()
        }

        // ============================================================
        // get_total_votes() - Get vote count for a specific cycle and candidate
        // Allows querying results from past cycles for transparency
        // ============================================================
        fn get_total_votes(self: @ContractState, cycle: u32, candidate_id: u32) -> u64 {
            // Read directly from Total_votes map with (cycle, candidate) key
            self.Total_votes.read((cycle, candidate_id))
        }
    }
}

// ============================================================
// UNIT TESTS
// ============================================================

#[cfg(test)]
mod tests {
    use snforge_std::{
        ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
        start_cheat_caller_address,
    };
    use starknet::ContractAddress;
    use super::{ElectionStages, IZkVotingDispatcher, IZkVotingDispatcherTrait};
    // STEP 4: Warp time forward by 49 hours (past 48 hour threshold)
    // Use cheatcode to manipulate block timestamp
    // use starknet::testing::set_block_timestamp;

    #[test]
    fn test_constructor_initialization() {
        // STEP 1: Declare the contract using the module name "ZkVoting"
        // Snforge finds this automatically in your compiled artifacts.
        let contract = declare("ZkVoting").unwrap().contract_class();

        // STEP 2: Prepare calldata for Array<felt252>
        // Pattern: [length, element1, element2, ...]
        let mut calldata = array![];
        calldata.append(2); // Length of the array (2 candidates)..must be included
        calldata.append('DeFi'); // Candidate 0 (ID 0)
        calldata.append('CeFi'); // Candidate 1 (ID 1)

        // STEP 3: Deploy the contract with constructor arguments
        let (contract_address, _) = contract.deploy(@calldata).unwrap();

        // STEP 4: Create dispatcher to call view functions
        let dispatcher = IZkVotingDispatcher { contract_address };

        // STEP 5: Read values from the deployed contract
        let owner = dispatcher.get_owner(); // Verify owner is set
        let round = dispatcher.get_current_election_round(); // Should be 1
        let total = dispatcher.get_total_candidate_nums(); // Should be 2
        let candidate0 = dispatcher.get_candidate(0); // Should be 'DeFi'
        let candidate1 = dispatcher.get_candidate(1); // Should be 'CeFi'

        // Zero address for comparison (owner should not be zero)
        let zero_address: ContractAddress = 0x0.try_into().unwrap();

        // STEP 6: Assert all constructor effects are correct
        assert(owner != zero_address, 'Owner should be set'); // Owner exists
        assert(round == 1, 'Round should be 1'); // Round starts at 1
        assert(total == 2, 'Should have 2 candidates'); // Count matches input
        assert(candidate0 == 'DeFi', 'Candidate 0 should be DeFi'); // First candidate stored
        assert(candidate1 == 'CeFi', 'Candidate 1 should be CeFi'); // Second candidate stored
    }

    #[test]
    fn test_vote_works_well() {
        // STEP 1: Deploy contract with candidates
        let contract = declare("ZkVoting").unwrap().contract_class();
        let mut calldata = array![];
        calldata.append(2); // 2 candidates
        calldata.append('DeFi');
        calldata.append('CeFi');
        let (contract_address, _) = contract.deploy(@calldata).unwrap();
        let dispatcher = IZkVotingDispatcher { contract_address };

        // STEP 2: Verify initial vote counts are 0
        let votes_defi_before = dispatcher.get_total_votes(1, 0);
        let votes_cefi_before = dispatcher.get_total_votes(1, 1);
        assert(votes_defi_before == 0, 'DeFi should start with 0 votes');

        // STEP 3: Cast a vote for DeFi (candidate 0)
        // Note: In test, we need to warp time to Voting phase
        // We assume deployment time is within first 24 hours
        dispatcher.vote(0);

        // STEP 4: Verify vote was recorded
        let votes_defi_after = dispatcher.get_total_votes(1, 0);
        assert(votes_defi_after == 1, 'DeFi should have 1 vote');
        assert(votes_cefi_before == 0, 'CeFi should still have 0 votes');
    }


    #[test]
    #[should_panic(expected: 'Already Voted!...Boom!')]
    fn test_vote_fails_double_voting() {
        // STEP 1: Deploy contract
        let contract = declare("ZkVoting").unwrap().contract_class();
        let mut calldata = array![];
        calldata.append(2);
        calldata.append('DeFi');
        calldata.append('CeFi');
        let (contract_address, _) = contract.deploy(@calldata).unwrap();
        let dispatcher = IZkVotingDispatcher { contract_address };

        // STEP 2: First vote - should succeed
        dispatcher.vote(0);

        // STEP 3: Second vote - should fail with 'Already Voted!...Boom!'
        dispatcher.vote(0);
    }

    #[test]
    fn test_advance_round_successful_after_48_hours() {
        // STEP 1: Deploy contract with candidates
        let contract = declare("ZkVoting").unwrap().contract_class();
        let mut calldata = array![];
        calldata.append(2);
        calldata.append('DeFi');
        calldata.append('CeFi');
        let (contract_address, _) = contract.deploy(@calldata).unwrap();
        let dispatcher = IZkVotingDispatcher { contract_address };

        // STEP 2: Check initial state - Round 1
        let round_before = dispatcher.get_current_election_round();
        assert(round_before == 1, 'Should start at round 1');

        // STEP 3: Cast ONE vote in round 1
        dispatcher.vote(0);

        // Verify vote recorded in round 1
        let votes_defi_round1 = dispatcher.get_total_votes(1, 0);
        assert(votes_defi_round1 == 1, 'Round 1: DeFi to have 1 vote');

        // STEP 4: Use cheatcode to warp time by 49 hours (use global version)
        start_cheat_block_timestamp(contract_address, 49 * 3600);

        // STEP 5: Advance to next round
        dispatcher.advance_to_next_election_round();

        // STEP 6: Verify round advanced to 2
        let round_after = dispatcher.get_current_election_round();
        assert(round_after == 2, 'Should advance to round 2');

        // STEP 7: Verify old round 1 votes are preserved
        let votes_defi_round1_after = dispatcher.get_total_votes(1, 0);
        assert(votes_defi_round1_after == 1, 'Round 1 votes preserved');

        // STEP 8: New round should have 0 votes
        let votes_defi_round2 = dispatcher.get_total_votes(2, 0);
        assert(votes_defi_round2 == 0, 'Round 2 to start with 0 votes');
    }


    #[test]
    #[should_panic(expected: 'Either wait or Advance round')]
    fn test_vote_fails_during_tallying_phase() {
        // STEP 1: Deploy contract with candidates
        let contract = declare("ZkVoting").unwrap().contract_class();
        let mut calldata = array![];
        calldata.append(2);
        calldata.append('DeFi');
        calldata.append('CeFi');
        let (contract_address, _) = contract.deploy(@calldata).unwrap();
        let dispatcher = IZkVotingDispatcher { contract_address };

        // STEP 2: Verify initial phase is Voting (first 24 hours)
        let phase_before = dispatcher.get_election_phase();
        assert(phase_before == ElectionStages::Voting, 'Should start in Voting phase');

        // STEP 3: Warp time to 30 hours (past Voting window, into Tallying)
        // 30 hours = 30 * 3600 = 108,000 seconds
        start_cheat_block_timestamp(contract_address, 30 * 3600);

        // STEP 4: Verify phase is now Tallying
        let phase_after = dispatcher.get_election_phase();
        assert(phase_after == ElectionStages::Tallying, 'Should be in Tallying phase');

        // STEP 5: Attempt to vote - should panic with 'Either wait or Advance round'
        dispatcher.vote(0);
    }

    #[test]
    fn test_update_candidates_by_owner() {
        // STEP 1: Deploy contract
        let contract = declare("ZkVoting").unwrap().contract_class();
        let mut calldata = array![];
        calldata.append(2);
        calldata.append('DeFi');
        calldata.append('CeFi');
        let (contract_address, _) = contract.deploy(@calldata).unwrap();
        let dispatcher = IZkVotingDispatcher { contract_address };

        // STEP 2: Verify initial candidates
        assert(dispatcher.get_candidate(0) == 'DeFi', 'first candidate 0 is be DeFi');
        assert(dispatcher.get_candidate(1) == 'CeFi', 'first candidate 1 is be CeFi');

        // STEP 3: Warp time to Results phase (40 hours = 144,000 seconds)
        // This MUST be after 36 hours to be in Results phase
        start_cheat_block_timestamp(contract_address, 40 * 3600);

        // STEP 4: Verify we're in Results phase
        let phase = dispatcher.get_election_phase();
        assert(phase == ElectionStages::Results, 'Should be in Results phase');

        // STEP 5: Update candidates - array is passed directly, dispatcher handles serialization
        let mut new_candidates = array![];
        new_candidates.append('Alice');
        new_candidates.append('Bob');
        dispatcher.update_candidates(new_candidates);

        // STEP 6: Verify candidates updated
        let candidate0 = dispatcher.get_candidate(0);
        let candidate1 = dispatcher.get_candidate(1);
        let total = dispatcher.get_total_candidate_nums();

        assert(candidate0 == 'Alice', 'Candidate 0 should be Alice');
        assert(candidate1 == 'Bob', 'Candidate 1 should be Bob');
        assert(total == 2, 'Count should be 2');
    }

    #[test]
    fn test_get_round_winner_during_results_phase() {
        // STEP 1: Deploy contract with candidates
        let contract = declare("ZkVoting").unwrap().contract_class();
        let mut calldata = array![];
        calldata.append(2);
        calldata.append('DeFi');
        calldata.append('CeFi');
        let (contract_address, _) = contract.deploy(@calldata).unwrap();
        let dispatcher = IZkVotingDispatcher { contract_address };

        // STEP 2: Create different user addresses
        let user1: ContractAddress = 0x1.try_into().unwrap();
        let user2: ContractAddress = 0x2.try_into().unwrap();
        let user3: ContractAddress = 0x3.try_into().unwrap();

        // STEP 3: User 1 votes for DeFi
        start_cheat_caller_address(contract_address, user1);
        dispatcher.vote(0);

        // STEP 4: User 2 votes for DeFi (second vote for DeFi)
        start_cheat_caller_address(contract_address, user2);
        dispatcher.vote(0);

        // STEP 5: User 3 votes for CeFi
        start_cheat_caller_address(contract_address, user3);
        dispatcher.vote(1);

        // STEP 6: Warp time to Results phase (40 hours)
        start_cheat_block_timestamp(contract_address, 40 * 3600);

        // STEP 7: Get winner
        let (winner_id, winner_votes, winner_name) = dispatcher.get_round_winner();

        // STEP 8: Verify winner (DeFi should win with 2 votes)
        assert(winner_id == 0, 'Winner should be DeFi (ID 0)');
        assert(winner_votes == 2, 'Winner should have 2 votes');
        assert(winner_name == 'DeFi', 'Winner name should be DeFi');
    }
}

