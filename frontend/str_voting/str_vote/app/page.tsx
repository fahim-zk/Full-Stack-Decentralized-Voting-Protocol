"use client";
import React, { useState, useEffect } from "react";
import { useAccount, useReadContract, useSendTransaction, useContract } from "@starknet-react/core";
import { Abi } from "starknet";
import dynamic from 'next/dynamic';
import ABI_JSON from "../public/abi.json";

const WalletBar = dynamic(() => import("./Components/WalletBar"), {
  ssr: false
});

// Contract address from your deployment
const CONTRACT_ADDRESS = "0x1d8fea123f9f7dfe4d7eb63e8737cdb9be509037893095e4b344df4264cbb8f";

// Manual mapping for candidate names
const CANDIDATE_NAMES: Record<number, string> = {
  0: "Decentralized Finance",
  1: "Centralized Finance"
};

// Phase mapping
const PHASE_NAMES: Record<number, string> = {
  0: "VOTING",
  1: "TALLYING",
  2: "RESULTS"
};

const PHASE_COLORS: Record<number, string> = {
  0: "from-emerald-600 to-teal-600",
  1: "from-amber-600 to-orange-600",
  2: "from-purple-600 to-pink-600"
};

// Phase thresholds in seconds
const PHASE_THRESHOLDS = {
  VOTING_END: 24 * 3600,
  TALLYING_END: 36 * 3600,
  RESULTS_END: 48 * 3600
};

// Error message mapping from contract
const getErrorMessage = (error: any): string => {
  const errorStr = error?.message || error?.toString() || "";
  
  if (errorStr.includes("Already Voted")) {
    return "❌ You have already voted in this round! One vote per wallet per election.";
  }
  if (errorStr.includes("Invalid candidate")) {
    return "❌ Invalid candidate selected. Please choose a valid candidate.";
  }
  if (errorStr.includes("Not in voting window")) {
    return "❌ Voting is not open right now. Please check the phase above.";
  }
  if (errorStr.includes("Round is still active")) {
    return "⏰ Cannot advance round yet. 48 hours must pass since cycle started.";
  }
  if (errorStr.includes("You Are Not The Owner")) {
    return "🔒 Only the contract owner can update candidates.";
  }
  if (errorStr.includes("Wait For The Results Phase")) {
    return "📊 Candidates can only be updated during RESULTS phase (36+ hours).";
  }
  if (errorStr.includes("Either wait or Advance round")) {
    return "⏰ Voting is closed. Either wait for next round or call 'Advance to Next Election Round' after 48 hours.";
  }
  
  return `❌ Transaction failed: ${errorStr.slice(0, 100)}`;
};

// Replace your existing getAdvanceButtonDisabledReason function with this:
const getAdvanceButtonDisabledReason = (currentPhase: number, timeInCycle: number): string => {
  if (currentPhase !== 2) return "⏰ Only available during RESULTS phase (36-48 hours)";
  if (timeInCycle < 48 * 3600) {
    const hoursLeft = Math.ceil((48 * 3600 - timeInCycle) / 3600);
    return `⏳ Must wait ${hoursLeft} more hour(s) for round to complete (48 hours total needed)`;
  }
  return "";
};

// // Get button disabled reason for Advance button
// const getAdvanceButtonDisabledReason = (currentPhase: number): string => {
//   if (currentPhase !== 2) return "⏰ Can only advance after RESULTS phase (48+ hours)";
//   return "";
// };

// Get button disabled reason for Update button
const getUpdateButtonDisabledReason = (isOwner: boolean, currentPhase: number): string => {
  if (!isOwner) return "🔒 Only the contract owner can update candidates";
  if (currentPhase !== 2) return "📊 Can only update during RESULTS phase (36+ hours)";
  return "";
};

// Get button disabled reason for Get Winner button
const getWinnerButtonDisabledReason = (currentPhase: number): string => {
  if (currentPhase !== 2) return "🏆 Winner only available during RESULTS phase (36+ hours)";
  return "";
};

// Get button disabled reason for Vote button
const getVoteButtonDisabledReason = (currentPhase: number, hasVoted: boolean): string => {
  if (hasVoted) return "✅ You have already voted in this round";
  if (currentPhase !== 0) return "🗳️ Voting only available during VOTING phase (first 24 hours)";
  return "";
};

// Format seconds to readable time (hours, minutes, seconds)
const formatTimeRemaining = (seconds: number): string => {
  if (seconds <= 0) return "Now!";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

// Get next phase info based on current time in cycle
const getNextPhaseInfo = (timeInCycle: number): { nextPhase: string; timeRemaining: number; message: string; textColor: string } => {
  if (timeInCycle < PHASE_THRESHOLDS.VOTING_END) {
    const remaining = PHASE_THRESHOLDS.VOTING_END - timeInCycle;
    return {
      nextPhase: "TALLYING",
      timeRemaining: remaining,
      message: `⏳ ${formatTimeRemaining(remaining)} until counting begins`,
      textColor: "text-yellow-300"
    };
  } else if (timeInCycle < PHASE_THRESHOLDS.TALLYING_END) {
    const remaining = PHASE_THRESHOLDS.TALLYING_END - timeInCycle;
    return {
      nextPhase: "RESULTS",
      timeRemaining: remaining,
      message: `📊 ${formatTimeRemaining(remaining)} until results are revealed`,
      textColor: "text-cyan-300"
    };
  } else if (timeInCycle < PHASE_THRESHOLDS.RESULTS_END) {
    const remaining = PHASE_THRESHOLDS.RESULTS_END - timeInCycle;
    return {
      nextPhase: "NEXT ROUND",
      timeRemaining: remaining,
      message: `🔄 ${formatTimeRemaining(remaining)} until next round can start`,
      textColor: "text-emerald-300"
    };
  } else {
    return {
      nextPhase: "NEXT ROUND",
      timeRemaining: 0,
      message: "✅ Ready to advance to next round!",
      textColor: "text-green-300"
    };
  }
};

export default function Home() {
  const { address: userAddress } = useAccount();
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<{ id: number; name: string }[]>([]);
  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [winner, setWinner] = useState<{ id: number; votes: number; name: string } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userHasVoted, setUserHasVoted] = useState<boolean>(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [manuallyFetchedWinner, setManuallyFetchedWinner] = useState<{ id: number; votes: number; name: string } | null>(null);
  
  // Countdown timer state
  const [currentTime, setCurrentTime] = useState<number>(Math.floor(Date.now() / 1000));
  const [cycleStartTimestamp, setCycleStartTimestamp] = useState<number>(0);
  const [timeInCycle, setTimeInCycle] = useState<number>(0);
  
  // Additional contract data for display
  const [cycleStartTime, setCycleStartTime] = useState<string>("");
  const [totalVotesDeFi, setTotalVotesDeFi] = useState<number>(0);
  const [totalVotesCeFi, setTotalVotesCeFi] = useState<number>(0);

  // Get contract object for read operations
  const { contract } = useContract({
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
  });

  // Read current phase
  const { data: phase, refetch: refetchPhase } = useReadContract({
    functionName: "get_election_phase",
    args: [],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  // Read current round
  const { data: round, refetch: refetchRound } = useReadContract({
    functionName: "get_current_election_round",
    args: [],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  // Read total candidates
  const { data: totalCandidates, refetch: refetchTotal } = useReadContract({
    functionName: "get_total_candidate_nums",
    args: [],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  // Read winner (auto)
  const { data: winnerData, refetch: refetchWinner } = useReadContract({
    functionName: "get_round_winner",
    args: [],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  // Read owner
  const { data: ownerData } = useReadContract({
    functionName: "get_owner",
    args: [],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  // Read cycle start time
  const { data: startTime, refetch: refetchStartTime } = useReadContract({
    functionName: "get_every_round_start_time",
    args: [],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  // Read total votes for each candidate
  const { data: votesDeFi, refetch: refetchVotesDeFi } = useReadContract({
    functionName: "get_total_votes",
    args: [currentRound, 0],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  const { data: votesCeFi, refetch: refetchVotesCeFi } = useReadContract({
    functionName: "get_total_votes",
    args: [currentRound, 1],
    abi: ABI_JSON as Abi,
    address: CONTRACT_ADDRESS,
    watch: true,
  });

  // Send transaction for voting
  const { send: vote, data: voteData } = useSendTransaction({
    calls: [{
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "vote",
      calldata: selectedCandidate !== null ? [selectedCandidate] : [0]
    }]
  });

  // Send transaction for advancing round
  const { send: advanceRound, data: advanceData } = useSendTransaction({
    calls: [{
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "advance_to_next_election_round",
      calldata: []
    }]
  });

  // Send transaction for updating candidates
  const { send: updateCandidates, data: updateData } = useSendTransaction({
    calls: [{
      contractAddress: CONTRACT_ADDRESS,
      entrypoint: "update_candidates",
      calldata: []
    }]
  });

  // Timer effect - updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update time in cycle when startTime or currentTime changes
  useEffect(() => {
    if (startTime !== undefined && startTime !== null) {
      const timestamp = Number(startTime);
      setCycleStartTimestamp(timestamp);
      const elapsed = currentTime - timestamp;
      setTimeInCycle(elapsed > 0 ? elapsed : 0);
    }
  }, [startTime, currentTime]);


  const fetchWinnerManually = async () => {
  if (currentPhase !== 2) {
    setErrorMessage("🏆 Winner only available during RESULTS phase (36+ hours)");
    return;
  }
  
  try {
    setLoading(true);
    
    // Use the vote counts you already have working!
    // These are already fetching correctly from the contract
    const defiVotes = totalVotesDeFi;
    const cefiVotes = totalVotesCeFi;
    
    console.log("DeFi votes:", defiVotes);
    console.log("CeFi votes:", cefiVotes);
    
    // Check if any votes were cast
    if (defiVotes === 0 && cefiVotes === 0) {
      setErrorMessage("ℹ️ No votes were cast in this round yet");
      return;
    }
    
    // Determine winner manually (same logic as your contract)
    let winnerId, winnerVotes;
    if (defiVotes >= cefiVotes) {  // >= because contract picks first on tie
      winnerId = 0;
      winnerVotes = defiVotes;
    } else {
      winnerId = 1;
      winnerVotes = cefiVotes;
    }
    
    setManuallyFetchedWinner({
      id: winnerId,
      votes: winnerVotes,
      name: CANDIDATE_NAMES[winnerId],
    });
    
    setSuccessMessage(`🏆 WINNER: ${CANDIDATE_NAMES[winnerId]} with ${winnerVotes} votes!`);
    
  } catch (error: any) {
    console.error("Error:", error);
    setErrorMessage(getErrorMessage(error));
  } finally {
    setLoading(false);
  }
};



  // Parse phase enum for CairoCustomEnum
  const parsePhase = (phase: any): number => {
    if (!phase) return 0;
    
    if (phase.variant) {
      const variant = phase.variant;
      if (variant.Voting !== undefined) return 0;
      if (variant.Tallying !== undefined) return 1;
      if (variant.Results !== undefined) return 2;
    }
    
    if (phase.Voting !== undefined) return 0;
    if (phase.Tallying !== undefined) return 1;
    if (phase.Results !== undefined) return 2;
    
    if (typeof phase === 'number') return phase;
    if (typeof phase === 'bigint') return Number(phase);
    
    return 0;
  };

  // Format timestamp to readable date
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return "Loading...";
    const ts = Number(timestamp);
    const date = new Date(ts * 1000);
    return date.toLocaleString();
  };

  // const DEPLOYER_ADDRESS = process.env.PUB_ADDRESS_DEPLOYER || "";
  // const isOwner = !!(userAddress && DEPLOYER_ADDRESS && 
  //   userAddress.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase());

//   // Keep using contract's owner value, but fix format comparison
// const normalizeAddress = (addr: string) => addr?.toLowerCase().replace(/^0x/, '');
// const isOwner = !!(userAddress && owner && 
//   normalizeAddress(userAddress) === normalizeAddress(owner));


  // Replace the isOwner line with this hardcoded check:
const DEPLOYER_ADDRESS = "0x0775feebecb3ba18dc2868954be191033185ef3c74ded6d4f33a3e04b9d1c01e";
const isOwner = !!(userAddress && userAddress.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase());

//   // Replace this line (around line 395):
// const isOwner = !!(userAddress && owner && userAddress.toLowerCase() === owner.toLowerCase());

// // With this:
// const isOwner = !!(userAddress && owner && 
//   (userAddress.toLowerCase() === owner.toLowerCase() ||
//    userAddress.toLowerCase() === `0x${owner.toLowerCase().replace(/^0x/, '')}` ||
//    userAddress.toLowerCase().replace(/^0x/, '') === owner.toLowerCase().replace(/^0x/, '')));

  // // Check if current user is owner
  // const isOwner = !!(userAddress && owner && userAddress.toLowerCase() === owner.toLowerCase());

  // Replace these two lines in your component (around line 400):
// const isAdvanceButtonDisabled = currentPhase !== 2;
// const advanceButtonDisabledReason = getAdvanceButtonDisabledReason(currentPhase);

// With these:
const isAdvanceButtonDisabled = currentPhase !== 2 || timeInCycle < 48 * 3600;
const advanceButtonDisabledReason = getAdvanceButtonDisabledReason(currentPhase, timeInCycle);

  // // Check if advance button should be disabled
  // const isAdvanceButtonDisabled = currentPhase !== 2;
  // const advanceButtonDisabledReason = getAdvanceButtonDisabledReason(currentPhase);

  // Check if update button should be disabled
  const isUpdateButtonDisabled = !isOwner || currentPhase !== 2;
  const updateButtonDisabledReason = getUpdateButtonDisabledReason(isOwner, currentPhase);

  // Check if winner button should be disabled
  const isWinnerButtonDisabled = currentPhase !== 2;
  const winnerButtonDisabledReason = getWinnerButtonDisabledReason(currentPhase);

  // Get next phase info for countdown
  const nextPhaseInfo = getNextPhaseInfo(timeInCycle);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Fetch candidates using manual mapping
  useEffect(() => {
    if (totalCandidates !== undefined && totalCandidates !== null) {
      const total = Number(totalCandidates);
      const candidatesList = [];
      for (let i = 0; i < total; i++) {
        candidatesList.push({
          id: i,
          name: CANDIDATE_NAMES[i] || `Candidate ${i}`,
        });
      }
      setCandidates(candidatesList);
    }
  }, [totalCandidates]);

  // Update phase and round
  useEffect(() => {
    if (phase !== undefined) {
      const parsedPhase = parsePhase(phase);
      setCurrentPhase(parsedPhase);
    }
    if (round !== undefined) setCurrentRound(Number(round));
    if (ownerData !== undefined) setOwner(ownerData.toString());
    if (startTime !== undefined) setCycleStartTime(formatTimestamp(startTime));
    if (votesDeFi !== undefined) setTotalVotesDeFi(Number(votesDeFi));
    if (votesCeFi !== undefined) setTotalVotesCeFi(Number(votesCeFi));
  }, [phase, round, ownerData, startTime, votesDeFi, votesCeFi]);


  // Update winner (auto)
useEffect(() => {
  if (winnerData && currentPhase === 2) {
    // Check if winnerData is an array (has votes)
    if (Array.isArray(winnerData) && winnerData.length === 3) {
      const [id, votes, name] = winnerData;
      setWinner({
        id: Number(id),
        votes: Number(votes),
        name: CANDIDATE_NAMES[Number(id)] || name.toString(),
      });
    } else {
      // No votes cast yet - winner is undefined
      setWinner(null);
    }
  } else {
    setWinner(null);
  }
}, [winnerData, currentPhase]);


  // Track vote status via transaction data (LOCAL tracking only)
  useEffect(() => {
    if (voteData?.transaction_hash) {
      setTxHash(voteData.transaction_hash);
      setSelectedCandidate(null);
      setUserHasVoted(true);
      setSuccessMessage("✅ Vote cast successfully!");
      setTimeout(() => {
        refetchPhase();
        refetchRound();
        refetchTotal();
        refetchWinner();
        refetchVotesDeFi();
        refetchVotesCeFi();
      }, 3000);
    }
  }, [voteData]);

  useEffect(() => {
    if (advanceData?.transaction_hash) {
      setTxHash(advanceData.transaction_hash);
      setSuccessMessage("✅ Round advanced successfully!");
      setUserHasVoted(false);
      setManuallyFetchedWinner(null);
      setTimeout(() => {
        refetchPhase();
        refetchRound();
        refetchTotal();
        refetchWinner();
        refetchStartTime();
        refetchVotesDeFi();
        refetchVotesCeFi();
      }, 3000);
    }
  }, [advanceData]);

  useEffect(() => {
    if (updateData?.transaction_hash) {
      setTxHash(updateData.transaction_hash);
      setSuccessMessage("✅ Candidates updated successfully!");
      setTimeout(() => {
        refetchPhase();
        refetchRound();
        refetchTotal();
        refetchWinner();
      }, 3000);
    }
  }, [updateData]);

  const handleVote = async (candidateId: number) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    
    if (!userAddress) {
      setErrorMessage("🔌 Please connect your wallet first");
      return;
    }
    
    if (userHasVoted) {
      setErrorMessage("❌ You have already voted in this round! One vote per wallet.");
      return;
    }
    
    if (currentPhase !== 0) {
      setErrorMessage(`❌ Voting is not open. Current phase: ${PHASE_NAMES[currentPhase]}`);
      return;
    }
    
    setLoading(true);
    setSelectedCandidate(candidateId);
    setTimeout(() => {
      vote();
      setLoading(false);
    }, 100);
  };

  const handleAdvanceRound = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    
    if (!userAddress) {
      setErrorMessage("🔌 Please connect your wallet first");
      return;
    }
    
    setLoading(true);
    advanceRound();
    setLoading(false);
  };

  const handleUpdateCandidates = () => {
  setErrorMessage(null);
  setSuccessMessage(null);
  
  if (!userAddress) {
    setErrorMessage("🔌 Please connect your wallet first");
    return;
  }
  
  if (!isOwner) {
    setErrorMessage("🔒 Only the contract owner can update candidates");
    return;
  }
  
  if (currentPhase !== 2) {
    setErrorMessage("📊 Candidates can only be updated during RESULTS phase (36+ hours)");
    return;
  }

  const candidate1 = prompt("Enter first candidate name:");
  const candidate2 = prompt("Enter second candidate name:");
  
  if (!candidate1 || !candidate2) {
    setErrorMessage("❌ Both candidate names are required");
    return;
  }

  setLoading(true);
  try {
    // Format correctly for Cairo Array<felt252>
    const updateCalldata = [2, candidate1, candidate2];
    // @ts-ignore
    updateCandidates({
      calls: [{
        contractAddress: CONTRACT_ADDRESS,
        entrypoint: "update_candidates",
        calldata: updateCalldata
      }]
    });
  } catch (error: any) {
    setErrorMessage(getErrorMessage(error));
    setLoading(false);
  }
};



  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* ENHANCED TOP BAR */}
      <div className="w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-700 py-3 px-6 flex flex-col items-center gap-2 shadow-lg">
        {/* Top Row - Status & Title */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 w-full">
          {/* Left Section - Status Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse bg-emerald-500 shadow-lg shadow-emerald-500/50"></div>
              <span className="text-[11px] font-mono font-bold text-emerald-400 tracking-wider">LIVE ON STARKNET SEPOLIA</span>
            </div>
            <div className="h-4 w-px bg-slate-600"></div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">ZK-STARK</span>
              <span className="text-[10px] font-mono text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">VERIFIED</span>
            </div>
          </div>

          {/* Center Section - Main Title with Badges */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <div className="bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 px-4 py-1.5 rounded-full border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
                   ZK VOTING DAPP
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-slate-800/80 px-2 py-1 rounded-md border border-slate-600">
                  <span className="text-[10px] font-mono text-cyan-400">⚡ CAIRO</span>
                </div>
                <div className="bg-slate-800/80 px-2 py-1 rounded-md border border-slate-600">
                  <span className="text-[10px] font-mono text-emerald-400">🔗 STARKNET</span>
                </div>
                <div className="bg-slate-800/80 px-2 py-1 rounded-md border border-slate-600">
                  <span className="text-[10px] font-mono text-purple-400">✓ VERIFIED ON ETHEREUM</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Section - Wallet */}
          <div className="flex items-center">
            <WalletBar />
          </div>
        </div>

        {/* Bottom Row - Divider, ZK Description, and PROMINENT GITHUB */}
        <div className="w-full flex flex-col items-center gap-2 mt-1">
          <div className="h-px w-full max-w-md bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
          
          <p className="text-[10px] text-slate-500 font-mono">Powered by Zero-Knowledge Proofs | STARK-based Validity Rollup</p>
          
          {/* PROMINENT GITHUB SECTION */}
          <a
            href="https://github.com/fahim-zk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-5 py-2 bg-gradient-to-r from-slate-800 to-slate-700/80 hover:from-slate-700 hover:to-slate-600 rounded-xl border border-slate-500 transition-all duration-300 group shadow-md hover:shadow-lg hover:shadow-purple-500/20"
          >
            <svg className="w-5 h-5 text-slate-300 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026.8-.223 1.65-.334 2.5-.334.85 0 1.7.111 2.5.334 1.91-1.296 2.75-1.026 2.75-1.026.544 1.378.201 2.397.098 2.65.64.7 1.028 1.595 1.028 2.688 0 3.846-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors tracking-wide">FOLLOW ON GITHUB</span>
            <span className="text-xs font-mono text-purple-400 bg-purple-900/50 px-2 py-0.5 rounded-md">@fahim-zk</span>
          </a>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        
        {/* ERROR MESSAGE */}
        {errorMessage && (
          <div className="mb-4 p-4 bg-red-600/20 border border-red-500 rounded-lg text-red-300 text-center">
            {errorMessage}
          </div>
        )}
        
        {/* SUCCESS MESSAGE */}
        {successMessage && (
          <div className="mb-4 p-4 bg-emerald-600/20 border border-emerald-500 rounded-lg text-emerald-300 text-center">
            {successMessage}
          </div>
        )}
        
        {/* PHASE BANNER */}
        <div className={`bg-gradient-to-r ${PHASE_COLORS[currentPhase]} rounded-xl p-6 mb-8 text-center`}>
          <h2 className="text-3xl font-bold text-white">{PHASE_NAMES[currentPhase]}</h2>
          <p className="text-white/80 mt-2">Round {currentRound}</p>
          
          {cycleStartTimestamp > 0 && timeInCycle < PHASE_THRESHOLDS.RESULTS_END && (
            <div className="mt-3 p-3 bg-black/40 rounded-lg border border-white/20">
              <p className={`text-lg font-bold ${nextPhaseInfo.textColor}`}>
                {nextPhaseInfo.message}
              </p>
            </div>
          )}
          
          {timeInCycle >= PHASE_THRESHOLDS.RESULTS_END && (
            <div className="mt-3 p-3 bg-emerald-600/40 rounded-lg border border-emerald-400/50">
              <p className="text-emerald-300 text-lg font-bold">
                ✅ Cycle complete! Ready for next round.
              </p>
            </div>
          )}
          
          {currentPhase === 0 && (
            <p className="text-white/70 text-sm mt-2">✅ Voting is OPEN! You can vote now.</p>
          )}
          {currentPhase === 1 && (
            <p className="text-white/70 text-sm mt-2">⏳ Counting in progress. Results available at 36+ hours.</p>
          )}
          {currentPhase === 2 && winner && (
            <div className="mt-4 bg-white/10 rounded-lg p-3">
              <p className="text-white font-bold">🏆 WINNER: {winner.name} 🏆</p>
              <p className="text-white/70">Votes received: {winner.votes}</p>
            </div>
          )}
          {currentPhase === 2 && manuallyFetchedWinner && !winner && (
            <div className="mt-4 bg-purple-600/20 rounded-lg p-3">
              <p className="text-white font-bold">🏆 WINNER : {manuallyFetchedWinner.name} 🏆</p>
              <p className="text-white/70">Votes received: {manuallyFetchedWinner.votes}</p>
            </div>
          )}
        </div>

         {}
        <div className="mt-4 mb-6 p-3 bg-green-500/20 border border-cyan-400 rounded-xl text-center">
          <p className="text-cyan-300 font-medium">
            Thank you for your attention to this matter of Cairo-Implimented ZK voting
          </p>
        </div>

        {/* CONTRACT INFO CARD - this comes next */}
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6"></div>


        {/* CONTRACT INFO CARD */}
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
          <h4 className="text-white font-semibold mb-2">📊 Contract Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">Contract Address:</div>
            <div className="text-cyan-400 font-mono text-xs break-all">{CONTRACT_ADDRESS}</div>
            <div className="text-slate-400">Current Round:</div>
            <div className="text-white">{currentRound}</div>
            <div className="text-slate-400">Phase:</div>
            <div className="text-white">{PHASE_NAMES[currentPhase]}</div>
            <div className="text-slate-400">Cycle Started:</div>
            <div className="text-white">{cycleStartTime || "Loading..."}</div>
            <div className="text-slate-400">Total Candidates:</div>
            <div className="text-white">{candidates.length}</div>
          </div>
        </div>

        {/* VOTE COUNTS CARD */}
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
          <h4 className="text-white font-semibold mb-2">📈 Current Vote Counts (Round {currentRound})</h4>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 bg-slate-700/50 rounded-lg">
              <p className="text-emerald-400 font-bold text-xl">{totalVotesDeFi}</p>
              <p className="text-slate-300 text-sm">Decentralized Finance</p>
            </div>
            <div className="p-3 bg-slate-700/50 rounded-lg">
              <p className="text-emerald-400 font-bold text-xl">{totalVotesCeFi}</p>
              <p className="text-slate-300 text-sm">Centralized Finance</p>
            </div>
          </div>
          {currentPhase === 1 && (
            <p className="text-amber-400 text-xs text-center mt-2">🔒 Votes hidden during counting phase</p>
          )}
        </div>

        {/* CANDIDATES GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {candidates.map((candidate) => {
            const isVoteDisabled = currentPhase !== 0 || userHasVoted;
            const voteDisabledReason = getVoteButtonDisabledReason(currentPhase, userHasVoted);
            
            return (
              <div key={candidate.id} className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
                <h3 className="text-xl font-semibold text-white">{candidate.name}</h3>
                <p className="text-slate-400 text-sm mt-2">Candidate ID: {candidate.id}</p>
                
                {currentPhase === 2 && (winner || manuallyFetchedWinner) && (
                  <p className="text-cyan-400 text-sm mt-2">
                    {(winner || manuallyFetchedWinner)?.id === candidate.id 
                      ? `🏆 WINNER - ${(winner || manuallyFetchedWinner)?.votes} votes` 
                      : "❌ Lost"}
                  </p>
                )}
                
                <button
                  onClick={() => handleVote(candidate.id)}
                  disabled={isVoteDisabled || loading}
                  title={isVoteDisabled ? voteDisabledReason : "Click to vote for this candidate"}
                  className={`mt-4 w-full px-4 py-2 rounded-lg transition-colors ${
                    isVoteDisabled || loading
                      ? "bg-emerald-600/50 text-white/50 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                  }`}
                >
                  {userHasVoted 
                    ? "✅ Already Voted" 
                    : loading 
                      ? "Processing..." 
                      : `🗳️ Vote for ${candidate.name}`}
                </button>
                
                {currentPhase !== 0 && !userHasVoted && (
                  <div className="mt-2 text-center">
                    <span className="text-amber-400/70 text-xs">(Voting closed)</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ACTION BUTTONS */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleAdvanceRound}
            disabled={isAdvanceButtonDisabled || loading}
            title={isAdvanceButtonDisabled ? advanceButtonDisabledReason : "Click to advance to next election round"}
            className={`px-4 py-3 rounded-lg transition-colors ${
              isAdvanceButtonDisabled || loading
                ? "bg-amber-600/50 text-white/50 cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
            }`}
          >
            ⏩ Advance to Next Election Round
          </button>

          <button
            onClick={fetchWinnerManually}
            disabled={isWinnerButtonDisabled || loading}
            title={isWinnerButtonDisabled ? winnerButtonDisabledReason : "Click to manually fetch the current round winner"}
            className={`px-4 py-3 rounded-lg transition-colors ${
              isWinnerButtonDisabled || loading
                ? "bg-cyan-600/50 text-white/50 cursor-not-allowed"
                : "bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
            }`}
          >
            🏆 Get Round Winner
          </button>

          <button
            onClick={handleUpdateCandidates}
            disabled={isUpdateButtonDisabled || loading}
            title={isUpdateButtonDisabled ? updateButtonDisabledReason : "Click to update candidates (only during RESULTS phase)"}
            className={`px-4 py-3 rounded-lg transition-colors ${
              isUpdateButtonDisabled || loading
                ? "bg-purple-600/50 text-white/50 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer"
            }`}
          >
            ✏️ Update Candidates (Owner Only)
          </button>
        </div>

        {/* ADDITIONAL INFO BUTTON */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            {showDebug ? "Hide Debug Info ▲" : "Show Debug Info ▼"}
          </button>
        </div>

        {/* DEBUG INFO */}
        {showDebug && (
          <div className="mt-4 p-4 bg-slate-900/50 rounded-lg text-xs font-mono">
            <h5 className="text-cyan-400 mb-2">🔧 Debug Information</h5>
            <div className="grid grid-cols-2 gap-1 text-slate-400">
              <div>Connected Wallet:</div>
              <div className="text-slate-300">{userAddress || "Not connected"}</div>
              <div>Contract Owner:</div>
              <div className="text-slate-300">{owner || "Loading..."}</div>
              <div>Is Owner:</div>
              <div className="text-slate-300">{isOwner ? "Yes" : "No"}</div>
              <div>Raw Phase Data:</div>
              <div className="text-slate-300 break-all">{JSON.stringify(phase)}</div>
              <div>Parsed Phase:</div>
              <div className="text-slate-300">{currentPhase}</div>
              <div>User Has Voted (Local):</div>
              <div className="text-slate-300">{userHasVoted ? "Yes" : "No"}</div>
              <div>Advance Button Disabled:</div>
              <div className="text-slate-300">{isAdvanceButtonDisabled ? "Yes" : "No"}</div>
              <div>Update Button Disabled:</div>
              <div className="text-slate-300">{isUpdateButtonDisabled ? "Yes" : "No"}</div>
              <div>Winner Button Disabled:</div>
              <div className="text-slate-300">{isWinnerButtonDisabled ? "Yes" : "No"}</div>
              <div>Next Phase:</div>
              <div className="text-slate-300">{nextPhaseInfo.nextPhase} in {formatTimeRemaining(nextPhaseInfo.timeRemaining)}</div>
            </div>
          </div>
        )}

        {/* OWNER INFO */}
        {owner && (
          <div className="mt-4 text-center text-slate-500 text-xs">
            👑 Owner: {owner.slice(0, 6)}...{owner.slice(-4)}
            {isOwner && <span className="ml-2 text-emerald-400">(You are the owner)</span>}
          </div>
        )}

        {/* TRANSACTION STATUS */}
        {txHash && (
          <div className="mt-4 p-4 bg-slate-800 rounded-lg text-center">
            <p className="text-slate-300 text-sm">📝 Transaction submitted</p>
            <a
              href={`https://sepolia.starkscan.co/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline text-sm"
            >
              🔗 View on Starkscan
            </a>
          </div>
        )}

        {/* RULES */}
        <div className="mt-8 p-6 bg-slate-800/30 rounded-xl">
          <h4 className="text-white font-semibold mb-3">📋 Voting Rules</h4>
          <ul className="text-slate-400 text-sm space-y-1">
            <li>• ✅ One vote per wallet address per round</li>
            <li>• 🗳️ Voting window: First 24 hours of each 48-hour cycle</li>
            <li>• ⏳ Counting window: Next 12 hours (results hidden)</li>
            <li>• 🏆 Results window: Final 12+ hours (winner visible)</li>
            <li>• ⏩ Only clickable after RESULTS phase (48+ hours)</li>
            <li>• 👑 Only owner can update candidates (during RESULTS phase)</li>
            <li>• 📊 Use the Vote Counts card to see live totals</li>
            <li>• 🏆 Click "Get Round Winner" button during RESULTS phase</li>
            <li>• ⏲️ Countdown timer shows time until next phase change</li>
          </ul>
        </div>

        {/* USER GUIDE - NEW SECTION */}
        <div className="mt-6 p-5 bg-gradient-to-r from-slate-800/40 to-slate-700/20 rounded-xl border border-slate-600/50">
          <h4 className="text-emerald-400 font-semibold mb-3 flex items-center gap-2">
            <span className="text-lg">📖</span> Getting Started
          </h4>
          <div className="space-y-2 text-slate-300 text-sm">
            <p className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">1.</span>
              <span>Install <span className="text-cyan-400 font-mono">Argent X</span> or <span className="text-cyan-400 font-mono">Braavos</span> wallet from browser extension store</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">2.</span>
              <span>Add <span className="text-yellow-400 font-mono">Starknet Sepolia</span> network to your wallet</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">3.</span>
              <span>Get testnet ETH from <span className="text-purple-400">Starknet Sepolia faucet</span> (Google it)</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">4.</span>
              <span>Click <span className="text-emerald-400">"Connect Wallet"</span> above and select your wallet</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">5.</span>
              <span>Vote during <span className="text-green-400 font-bold">VOTING phase</span> (first 24 hours of each 48-hour cycle)</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">6.</span>
              <span>Confirm transaction in your wallet — one vote per wallet per round</span>
            </p>
          </div>
          <div className="mt-3 pt-2 text-xs text-slate-500 border-t border-slate-700/50">
            <p>💡 <span className="text-cyan-400">Tip:</span> You need Sepolia ETH for gas. Get it from faucet. 💰</p>
          </div>
        </div>
      </div>
    </main>
  );
}







