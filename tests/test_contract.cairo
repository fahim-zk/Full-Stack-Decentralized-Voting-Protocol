// // VotingComponent.jsx
// // Updated frontend for the automated voting contract
// // Features: No owner controls, past cycle viewing, automatic results at 36h

// import React, { useState, useEffect } from 'react';
// import { Contract, Provider } from 'starknet';
// import { useStarknet } from '@starknet-react/core';

// // REPLACE THIS WITH YOUR DEPLOYED CONTRACT ADDRESS
// const CONTRACT_ADDRESS = "YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE";

// // REPLACE THIS WITH YOUR ABI FROM COMPILATION
// const ABI = [
//     // You'll get this from: scarb build -> target/dev/your_contract.contract_class.json
//     // Or use starknet-cli to generate: starknet abi your_contract.json
// ];

// function VotingComponent() {
//     const { account } = useStarknet();
//     const [phase, setPhase] = useState('');
//     const [candidates, setCandidates] = useState([]);
//     const [currentVotes, setCurrentVotes] = useState({});
//     const [timeRemaining, setTimeRemaining] = useState(0);
//     const [currentCycle, setCurrentCycle] = useState(0);
//     const [pastCycleNumber, setPastCycleNumber] = useState('');
//     const [pastCycleResults, setPastCycleResults] = useState({});
//     const [showPastCycle, setShowPastCycle] = useState(false);
//     const [loading, setLoading] = useState(false);
//     const [userHasVoted, setUserHasVoted] = useState(false);

//     // Helper: Get contract instance
//     const getContract = () => {
//         const provider = new Provider({ sequencer: { network: "sepolia" } });
//         return new Contract(ABI, CONTRACT_ADDRESS, provider);
//     };

//     // Fetch current cycle info
//     const fetchCycleInfo = async () => {
//         try {
//             const contract = getContract();
//             const cycle = await contract.get_current_cycle();
//             setCurrentCycle(Number(cycle));
//         } catch (error) {
//             console.error("Error fetching cycle:", error);
//         }
//     };

//     // Fetch current phase
//     const fetchPhase = async () => {
//         try {
//             const contract = getContract();
//             const phaseName = await contract.get_current_phase();
//             const phaseStr = phaseName.toString();
//             setPhase(phaseStr);

//             // Calculate time remaining if in voting phase
//             if (phaseStr === 'Voting') {
//                 // Note: Contract doesn't have built-in time remaining function
//                 // We can calculate it from cycle_start_time if needed
//                 // For now, just show generic message
//                 setTimeRemaining(86400); // Default 24h
//             }
//         } catch (error) {
//             console.error("Error fetching phase:", error);
//         }
//     };

//     // Fetch all candidates and their current votes
//     const fetchCandidates = async () => {
//         try {
//             const contract = getContract();
//             const count = await contract.get_candidate_count();
//             const candidatesList = [];
//             const votesMap = {};

//             for (let i = 0; i < Number(count); i++) {
//                 const name = await contract.get_candidate(i);
//                 candidatesList.push({ id: i, name: name.toString() });

//                 // Get current vote counts (returns 0 if hidden)
//                 const voteCount = await contract.get_current_votes(i);
//                 votesMap[i] = Number(voteCount);
//             }

//             setCandidates(candidatesList);
//             setCurrentVotes(votesMap);
//         } catch (error) {
//             console.error("Error fetching candidates:", error);
//         }
//     };

//     // Check if current user has voted
//     const checkUserVoted = async () => {
//         if (!account) return;

//         try {
//             const contract = getContract();
//             const hasVoted = await contract.has_user_voted_in_current_cycle(account.address);
//             setUserHasVoted(hasVoted);
//         } catch (error) {
//             console.error("Error checking vote status:", error);
//         }
//     };

//     // Fetch past cycle results
//     const fetchPastCycleResults = async (cycleNumber) => {
//         setLoading(true);
//         try {
//             const contract = getContract();
//             const count = await contract.get_candidate_count();
//             const resultsMap = {};

//             for (let i = 0; i < Number(count); i++) {
//                 const voteCount = await contract.get_past_cycle_results(cycleNumber, i);
//                 resultsMap[i] = Number(voteCount);
//             }

//             setPastCycleResults(resultsMap);
//             setShowPastCycle(true);
//         } catch (error) {
//             console.error("Error fetching past results:", error);
//             alert("Failed to load past cycle results. Make sure cycle number is valid.");
//         } finally {
//             setLoading(false);
//         }
//     };

//     // Cast vote
//     const castVote = async (candidateId) => {
//         if (!account) {
//             alert("Please connect your wallet first!");
//             return;
//         }

//         if (userHasVoted) {
//             alert("You already voted in this cycle!");
//             return;
//         }

//         if (phase !== 'Voting') {
//             alert(`Cannot vote during ${phase} phase. Voting only during first 24 hours.`);
//             return;
//         }

//         setLoading(true);

//         try {
//             const provider = new Provider({ sequencer: { network: "sepolia" } });
//             const contract = new Contract(ABI, CONTRACT_ADDRESS, provider);
//             contract.connect(account);

//             // Execute vote transaction
//             const tx = await contract.vote(candidateId);
//             await provider.waitForTransaction(tx.transaction_hash);

//             alert("✅ Vote cast successfully!");

//             // Refresh all data
//             await fetchPhase();
//             await fetchCandidates();
//             await checkUserVoted();
//             await fetchCycleInfo();

//         } catch (error) {
//             console.error("Error casting vote:", error);
//             alert("❌ Vote failed: " + (error.message || "Unknown error"));
//         } finally {
//             setLoading(false);
//         }
//     };

//     // Format time remaining (seconds to readable string)
//     const formatTime = (seconds) => {
//         const hours = Math.floor(seconds / 3600);
//         const minutes = Math.floor((seconds % 3600) / 60);
//         return `${hours}h ${minutes}m`;
//     };

//     // Get phase color
//     const getPhaseColor = () => {
//         switch(phase) {
//             case 'Voting': return '#4CAF50'; // Green
//             case 'Counting': return '#FF9800'; // Orange
//             case 'Results': return '#2196F3'; // Blue
//             case 'Results (Completed)': return '#9C27B0'; // Purple
//             default: return '#9E9E9E'; // Gray
//         }
//     };

//     // Get phase description
//     const getPhaseDescription = () => {
//         switch(phase) {
//             case 'Voting':
//                 return "🗳️ Voting is OPEN! Cast your vote for your favorite candidate.";
//             case 'Counting':
//                 return "🔄 Votes are being counted. Results will be available in 12 hours.";
//             case 'Results':
//                 return "📊 Results are now available! Check the vote counts below.";
//             case 'Results (Completed)':
//                 return "🏆 This cycle has ended. Check past results or start a new election by
//                 voting!";
//             default:
//                 return "Loading phase information...";
//         }
//     };

//     // Auto-refresh every 15 seconds
//     useEffect(() => {
//         const refreshData = async () => {
//             await fetchCycleInfo();
//             await fetchPhase();
//             await fetchCandidates();
//             if (account) {
//                 await checkUserVoted();
//             }
//         };

//         refreshData();

//         const interval = setInterval(refreshData, 15000);
//         return () => clearInterval(interval);
//     }, [account]);

//     return (
//         <div style={{
//             maxWidth: '800px',
//             margin: '0 auto',
//             padding: '20px',
//             fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
//         }}>
//             <h1 style={{ textAlign: 'center', color: '#333' }}>
//                 🗳️ Decentralized Voting DApp
//             </h1>
//             <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
//                 on Starknet Sepolia Testnet
//             </p>

//             {/* Cycle Info */}
//             <div style={{
//                 textAlign: 'center',
//                 padding: '10px',
//                 backgroundColor: '#f5f5f5',
//                 borderRadius: '8px',
//                 marginBottom: '20px'
//             }}>
//                 <strong>Current Cycle:</strong> #{currentCycle}
//             </div>

//             {/* Phase Banner */}
//             <div style={{
//                 padding: '20px',
//                 backgroundColor: getPhaseColor(),
//                 color: 'white',
//                 borderRadius: '12px',
//                 marginBottom: '20px',
//                 textAlign: 'center'
//             }}>
//                 <h2 style={{ margin: '0 0 10px 0' }}>{phase}</h2>
//                 <p style={{ margin: '0', opacity: 0.95 }}>{getPhaseDescription()}</p>
//                 {phase === 'Voting' && timeRemaining > 0 && (
//                     <p style={{ margin: '10px 0 0 0', fontWeight: 'bold' }}>
//                         ⏰ Voting ends in: {formatTime(timeRemaining)}
//                     </p>
//                 )}
//             </div>

//             {/* Wallet Connection Status */}
//             {!account && (
//                 <div style={{
//                     padding: '15px',
//                     backgroundColor: '#FFF3CD',
//                     border: '1px solid #FFEeba',
//                     borderRadius: '8px',
//                     marginBottom: '20px',
//                     textAlign: 'center'
//                 }}>
//                     ⚠️ Please connect your Starknet wallet (Argent X or Braavos) to vote
//                 </div>
//             )}

//             {/* Candidates List */}
//             <h2>📋 Candidates</h2>
//             <div style={{ marginBottom: '30px' }}>
//                 {candidates.map(candidate => (
//                     <div key={candidate.id} style={{
//                         border: '1px solid #e0e0e0',
//                         borderRadius: '10px',
//                         padding: '15px 20px',
//                         marginBottom: '12px',
//                         display: 'flex',
//                         justifyContent: 'space-between',
//                         alignItems: 'center',
//                         backgroundColor: 'white',
//                         boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
//                     }}>
//                         <div>
//                             <strong style={{ fontSize: '1.1rem' }}>{candidate.name}</strong>
//                             {(phase === 'Results' || phase === 'Results (Completed)') &&
//                             currentVotes[candidate.id] !== undefined && (
//                                 <p style={{ margin: '5px 0 0 0', color: '#666' }}>
//                                     Votes: {currentVotes[candidate.id]}
//                                 </p>
//                             )}
//                         </div>

//                         {phase === 'Voting' && account && !userHasVoted && (
//                             <button
//                                 onClick={() => castVote(candidate.id)}
//                                 disabled={loading}
//                                 style={{
//                                     padding: '10px 24px',
//                                     backgroundColor: '#4CAF50',
//                                     color: 'white',
//                                     border: 'none',
//                                     borderRadius: '6px',
//                                     cursor: loading ? 'not-allowed' : 'pointer',
//                                     fontSize: '14px',
//                                     fontWeight: 'bold',
//                                     transition: 'background-color 0.2s'
//                                 }}
//                                 onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
//                                 onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
//                             >
//                                 {loading ? 'Processing...' : 'Vote'}
//                             </button>
//                         )}

//                         {phase === 'Voting' && account && userHasVoted && (
//                             <span style={{
//                                 padding: '8px 16px',
//                                 backgroundColor: '#e0e0e0',
//                                 borderRadius: '6px',
//                                 color: '#666'
//                             }}>
//                                 ✓ Voted
//                             </span>
//                         )}

//                         {phase !== 'Voting' && (
//                             <span style={{
//                                 padding: '8px 16px',
//                                 backgroundColor: '#f0f0f0',
//                                 borderRadius: '6px',
//                                 color: '#999'
//                             }}>
//                                 {phase === 'Results' ? 'Results Available' : 'Voting Closed'}
//                             </span>
//                         )}
//                     </div>
//                 ))}
//             </div>

//             {/* Past Cycle Viewer */}
//             <div style={{
//                 marginTop: '30px',
//                 padding: '20px',
//                 backgroundColor: '#f8f9fa',
//                 borderRadius: '12px',
//                 border: '1px solid #e0e0e0'
//             }}>
//                 <h3>📜 View Past Election Results</h3>
//                 <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom:
//                 '15px' }}>
//                     <input
//                         type="number"
//                         placeholder="Cycle number (0, 1, 2...)"
//                         value={pastCycleNumber}
//                         onChange={(e) => setPastCycleNumber(e.target.value)}
//                         style={{
//                             padding: '10px',
//                             borderRadius: '6px',
//                             border: '1px solid #ccc',
//                             flex: 1
//                         }}
//                     />
//                     <button
//                         onClick={() => fetchPastCycleResults(parseInt(pastCycleNumber))}
//                         disabled={loading || !pastCycleNumber}
//                         style={{
//                             padding: '10px 20px',
//                             backgroundColor: '#6c757d',
//                             color: 'white',
//                             border: 'none',
//                             borderRadius: '6px',
//                             cursor: 'pointer'
//                         }}
//                     >
//                         Load Results
//                     </button>
//                 </div>

//                 {showPastCycle && pastCycleNumber && (
//                     <div>
//                         <h4>Cycle #{pastCycleNumber} Results:</h4>
//                         {candidates.map(candidate => (
//                             <div key={candidate.id} style={{
//                                 display: 'flex',
//                                 justifyContent: 'space-between',
//                                 padding: '8px',
//                                 borderBottom: '1px solid #e0e0e0'
//                             }}>
//                                 <span>{candidate.name}</span>
//                                 <span><strong>{pastCycleResults[candidate.id] || 0}</strong>
//                                 votes</span>
//                             </div>
//                         ))}
//                     </div>
//                 )}
//             </div>

//             {/* Info Section */}
//             <div style={{
//                 marginTop: '30px',
//                 padding: '15px',
//                 backgroundColor: '#e3f2fd',
//                 borderRadius: '8px',
//                 fontSize: '12px',
//                 color: '#1565c0'
//             }}>
//                 <h4 style={{ margin: '0 0 10px 0 }}>ℹ️ How it works</h4>
//                 <ul style={{ margin: 0, paddingLeft: '20px' }}>
//                     <li><strong>Voting Window:</strong> First 24 hours of each 48-hour cycle</li>
//                     <li><strong>Counting Window:</strong> Next 12 hours (results hidden)</li>
//                     <li><strong>Results Window:</strong> Final 12+ hours (results visible)</li>
//                     <li><strong>Next Cycle:</strong> Starts automatically when someone votes
//                     after 48 hours</li>
//                     <li><strong>Past Results:</strong> Always accessible via the viewer
//                     above</li>
//                     <li><strong>One Vote:</strong> Per wallet address per cycle</li>
//                 </ul>
//             </div>
//         </div>
//     );
// }

// export default VotingComponent;
