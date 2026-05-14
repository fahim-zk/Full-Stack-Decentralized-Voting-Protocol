#  ZK Voting DApp — Full Stack Starknet Governance Protocol

A decentralized voting protocol built with **Cairo**, **Starknet**, and **Next.js**, demonstrating how Zero-Knowledge infrastructure can power transparent, verifiable, and scalable on-chain governance systems.

This project combines:

-  Cairo smart contracts
-  STARK-based validity proofs
-  Starknet smart accounts
-  Modern React/Next.js frontend
-  Time-based election lifecycle logic
-  Owner-controlled governance updates
-  Real-time vote tracking
-  Automated election phase transitions


---

# Advantage over Traditional Voting Sytems

Traditional voting systems suffer from several problems:

- Centralized control
- Difficult verification
- Poor transparency
- High infrastructure costs
- Limited auditability

This protocol explores how **Zero-Knowledge rollups** and **STARK proofs** can improve governance systems through:

- Verifiable computation
- Transparent state transitions
- Immutable vote recording
- Cheap execution on Starknet
- Cryptographic integrity

---

#  ZK / STARK Concepts Used

This project indirectly demonstrates core Zero-Knowledge ecosystem ideas through Starknet.

##  Cairo Execution

The contract is written entirely in **Cairo**, Starknet’s native proving language.

Every transaction executed on Starknet is:
- Proven off-chain
- Verified using STARK proofs
- Compressed into Ethereum settlement

This means voting logic becomes:
- Verifiable
- Tamper-resistant
- Scalable

---

##  Starknet Smart Accounts

Users interact using:
- ArgentX
- Braavos
---

##  Validity Rollup Architecture

Your protocol runs on:
- Starknet Sepolia

Transactions:
1. Execute on Starknet
2. Generate STARK proofs
3. Finalize to Ethereum

This creates:
- Low fees
- High throughput
- Ethereum-grade security

---

#  Full Architecture Overview

```text
         ┌───────────────────────────────────────────────┐
         │               FRONTEND (NEXT.JS)              │
         │                                               │
         │ React + TypeScript + TailwindCSS              │
         │ Starknet-React Wallet Integration             │
         │ Dynamic Voting UI                             │
         │ Countdown Timers                              │
         │ Election Phase Tracking                       │
         └───────────────────┬───────────────────────────┘
                             │
                             │ READ / WRITE
                             ▼
                  ┌──────────────────────┐
                  │  STARKNET-REACT SDK  │
                  │ useReadContract()    │
                  │ useSendTransaction() │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │     WALLET LAYER     │
                  │  ArgentX / Braavos   │
                  └──────────┬───────────┘
                             │
                             ▼
                ┌──────────────────────────┐
                │    STARKNET SEPOLIA      │
                │   Cairo Smart Contract   │
                │                          │
                │  • Voting Logic          │
                │  • Time Windows          │
                │  • Winner Computation    │
                │  • Candidate Management  │
                │  • Election Rounds       │
                └──────────┬───────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │     STARK PROVER         │
              │  Generates Validity      │
              │  Proofs (ZK-STARKs)      │
              └──────────┬───────────────┘
                         │
                         ▼
              ┌──────────────────────────┐
              │        ETHEREUM          │
              │   Final Settlement       │
              └──────────────────────────┘
```

---

#  Election Lifecycle

The protocol uses a **48-hour election cycle**.

## Phase 1 — Voting (0 → 24 Hours)

Users can:
- Connect wallet
- Vote once
- Submit transactions

Restrictions:
- One vote per wallet
- Invalid candidates rejected
- Duplicate voting blocked

---

## Phase 2 — Tallying (24 → 36 Hours)

Voting closes.

During this period:
- No new votes allowed
- Vote counts continue syncing
- Winner not finalized yet

This simulates a counting window.

---

##  Phase 3 — Results (36 → 48 Hours)

The protocol exposes:
- Winner
- Vote totals
- Round statistics

The contract owner can:
- Update candidates
- Prepare next election

---

##  Next Election Round (48+ Hours)

After 48 hours:
- Election can advance
- Vote counts reset for next round
- Historical rounds remain preserved

---

#  Project Structure

```text
zk-voting-dapp/
│
├── src/
│   └── lib.cairo                 # Cairo Smart Contract
│
├── tests/
│   └── voting_tests.cairo        # Snforge Test Suite
│
├── scripts/
│   └── deploy.ts                 # Deployment Script
│
├── abi.json                      # Generated ABI
│
├── frontend/
│   └── app/
│       ├── page.tsx              # Main Voting Interface
│       ├── Components/
│       │   └── WalletBar.tsx
│       └── public/
│           └── abi.json
│
├── Scarb.toml
├── package.json
└── README.md
```

---

# 🧪 Smart Contract Features

##  Constructor Initialization

Initializes:
- Owner
- Candidate list
- Election round
- Cycle timestamps

---

##  Vote Functionality

The contract enforces:
- One vote per address
- Candidate validation
- Voting phase restrictions

---

##  Election Phase Detection

Phase automatically changes based on:
- Block timestamp
- Elapsed cycle duration

---

##  Winner Computation

The contract:
- Tracks vote totals
- Calculates highest votes
- Returns winner metadata

---

##  Candidate Updates

Only owner can:
- Modify candidates
- During results phase only

---

#  Testing Infrastructure

The project uses:
- `snforge`
- Starknet Foundry
- Cairo unit testing

---

#  Test Coverage

The tests validate:

##  Constructor Logic

```rust
test_constructor_initialization()
```

Checks:
- Owner setup
- Candidate initialization
- Round initialization

---

##  Voting Works

```rust
test_vote_works_well()
```

Checks:
- Vote recording
- Vote counting

---

##  Double Voting Prevention

```rust
test_vote_fails_double_voting()
```

Ensures:
- One wallet = one vote

---

##  Time-Based Round Advancement

```rust
test_advance_round_successful_after_48_hours()
```

Uses Starknet cheatcodes:
- Block timestamp warping
- Round transitions

---

##  Voting Window Enforcement

```rust
test_vote_fails_during_tallying_phase()
```

Ensures:
- Voting blocked outside voting phase

---

##  Owner Candidate Management

```
test_update_candidates_by_owner()
```

Ensures:
- Only owner can update candidates
- Results phase enforcement

---

##  Winner Calculation

```
test_get_round_winner_during_results_phase()
```

Simulates:
- Multiple voters
- Vote distribution
- Winner resolution

---
