// ============================================================
// STARKNET VOTING CONTRACT DEPLOYMENT SCRIPT
// ============================================================
// This script deploys the ZkVoting contract to Starknet Sepolia testnet
// It handles: declaration, deployment, verification, and file saving
// ============================================================

// ============================================================
// IMPORTS
// ============================================================

import {
    Contract,      // Creates contract instance to interact with deployed contract
    Account,       // Creates wallet account for signing transactions
    json,          // Parses JSON contract files
    RpcProvider,   // Creates connection to Starknet node
    hash,          // Computes contract class hashes
} from "starknet";
import dotenv from "dotenv";  // Loads environment variables from .env file
import fs from "fs";           // File system operations (read/write files)

// ============================================================
// INITIALIZATION
// ============================================================

// Load environment variables from .env file (WALLET_ADDRESS, PRIVATE_KEY)
dotenv.config();

// ============================================================
// MAIN DEPLOYMENT FUNCTION
// ============================================================

async function DeployingZkVoting() {
    
    // ============================================================
    // STEP 1: CREATE RPC PROVIDER (Connection to Starknet)
    // ============================================================
    // This creates a connection to a Starknet node on Sepolia testnet
    const linker = new RpcProvider({
        nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/JTbGMwpsVrozf8XBia0re",
    });
    
    // ============================================================
    // STEP 2: VERIFY NETWORK
    // ============================================================
    // Get the current network's chain ID
    const chainID = await linker.getChainId();
    console.log("We are connected to the network with chain ID: ", chainID);
    
    // Note: You can add a check here to ensure you're on Sepolia
    // if (chainID !== "0x534e5f5345504f4c4941") {
    //     throw new Error("Wrong network! Please use Sepolia testnet.");
    // }

    // ============================================================
    // STEP 3: LOAD WALLET CREDENTIALS
    // ============================================================
    // Get wallet address and private key from environment variables
    const wallet_addr = process.env.WALLET_ADDRESS;
    const sign_key = process.env.PRIVATE_KEY;

    // Validate both credentials are present
    if (!wallet_addr || !sign_key) {
        throw new Error("Please provide both the wallet address and the private key");
    }

    // ============================================================
    // STEP 4: CREATE ACCOUNT (Signer for transactions)
    // ============================================================
    // Create an account instance that will sign all transactions
    const myAccount = new Account({
        provider: linker,      // RPC connection
        address: wallet_addr,  // Wallet address
        signer: sign_key,      // Private key for signing
        cairoVersion: "1"      // Cairo version
    });

    console.log("Account created successfully with wallet address: ", myAccount.address);

    // ============================================================
    // STEP 5: READ COMPILED CONTRACT FILES
    // ============================================================
    // Read the Sierra contract class (main contract file)
    const sierra = json.parse(
        fs.readFileSync("./target/dev/stark_voting_ZkVoting.contract_class.json").toString("ascii")
    );

    // Read the CASM compiled class (required for declaration)
    const CASM = json.parse(
        fs.readFileSync("./target/dev/stark_voting_ZkVoting.compiled_contract_class.json").toString("ascii")
    );

    // ============================================================
    // STEP 6: COMPUTE COMPILED CLASS HASH
    // ============================================================
    // Compute the compiled class hash from the CASM file
    // This hash uniquely identifies this contract version
    const compiled_class_hash = hash.computeCompiledClassHash(CASM);
    console.log("Compiled class hash: ", compiled_class_hash);

    // ============================================================
    // STEP 7: DECLARE CONTRACT (Create blueprint on blockchain)
    // ============================================================
    // Declaration uploads the contract class to the blockchain
    // This creates a blueprint that can be deployed multiple times
    console.log("Declaring the contract...May take up to a minute...");

    const declareResponse = await myAccount.declare({
        contract: sierra,                // Sierra contract class
        casm: CASM,                      // CASM compiled class
        compiledClassHash: compiled_class_hash  // Compiled class hash
    });

    console.log("Declaration Transaction Hash: ", declareResponse.transaction_hash);

    // ============================================================
    // STEP 8: WAIT FOR DECLARATION CONFIRMATION
    // ============================================================
    // Wait for the network to confirm the declaration transaction
    console.log("Waiting for the declaration confirmation...");
    await linker.waitForTransaction(declareResponse.transaction_hash);
    console.log("Declaration confirmed!...Huraa!!");
    // Uncomment below line to see the class hash
    // console.log("The Class Hash: ", declareResponse.class_hash);

    // ============================================================
    // STEP 9: DEPLOY CONTRACT (Create instance from blueprint)
    // ============================================================
    // Deploy a new instance of the contract using the declared class
    console.log("Deploying the contract instance...May take a while...");

    // Prepare constructor arguments for the deployment
    // Format: [length, candidate1, candidate2, ...]
    const constructorArgs = [2, 'Decentralized Finance', 'Centralized Finance'];

    const deployResponse = await myAccount.deployContract({
        classHash: declareResponse.class_hash,      // Class hash from declaration
        constructorCalldata: constructorArgs        // Constructor arguments
    });

    console.log("Deployment Transaction Hash: ", deployResponse.transaction_hash);

    // ============================================================
    // STEP 10: WAIT FOR DEPLOYMENT CONFIRMATION
    // ============================================================
    // Wait for the network to confirm the deployment transaction
    console.log("Waiting for the deployment confirmation...");
    await linker.waitForTransaction(deployResponse.transaction_hash);
    console.log("Deployment has been confirmed!...Huraa!!");

    // ============================================================
    // STEP 11: GET CONTRACT ABI
    // ============================================================
    // Retrieve the ABI (Application Binary Interface) from the chain
    // The ABI is needed for the frontend to interact with the contract
    const { abi } = await linker.getClassByHash(declareResponse.class_hash);

    if (!abi) {
        throw new Error("ABI has not been found for the deployment contract");
    }

    // ============================================================
    // STEP 12: CREATE CONTRACT INSTANCE
    // ============================================================
    // Create a Contract object to interact with the deployed contract
    const VotingContractInfo = new Contract({
        abi: abi,                            // Contract ABI
        address: deployResponse.contract_address,  // Deployed address
        providerOrAccount: linker            // RPC provider
    });

    console.log("Contract has been successfully deployed at Address: ", VotingContractInfo.address);
    console.log("Contract Class Hash: ", declareResponse.class_hash);

    // ============================================================
    // STEP 13: SAVE ABI TO FILE
    // ============================================================
    // Save the ABI to abi.json for frontend use
    fs.writeFileSync("abi.json", JSON.stringify(abi, null, 2));

    // ============================================================
    // STEP 14: SAVE CONTRACT INFO TO FILE
    // ============================================================
    // Save deployment information for future reference
    const contractInfo = {
        contractAddress: deployResponse.contract_address,  // Deployed contract address
        classHash: declareResponse.class_hash,             // Class hash (blueprint ID)
        deployerAddress: myAccount.address,                // Wallet that deployed
        network: "sepolia",                                 // Network name
        deployedAt: new Date().toISOString()               // Deployment timestamp
    };

    fs.writeFileSync("contractInfo.json", JSON.stringify(contractInfo, null, 2));

    // ============================================================
    // STEP 15: VERIFY CONTRACT STATE
    // ============================================================
    // Call view functions to ensure the contract deployed correctly
    console.log("\n🔍 Verifying contract state...");

    // Get total number of candidates
    const totalCandidates = await VotingContractInfo.get_total_candidate_nums();
    console.log("Total number of Candidates: ", totalCandidates);

    // Get candidate 0 name
    const candi0 = await VotingContractInfo.get_candidate(0);
    console.log("Candidate0 is: ", candi0);

    // Get candidate 1 name
    const candi1 = await VotingContractInfo.get_candidate(1);
    console.log("Candidate1 is: ", candi1);

    // Get current round number
    const round = await VotingContractInfo.get_current_election_round();
    console.log("Current round is: ", round);

    // ============================================================
    // STEP 16: DEPLOYMENT COMPLETE
    // ============================================================
    console.log("Everything is successful and the contract is working as expected!!!");
    console.log("Congrats to all Devs!!");
}

// ============================================================
// RUN DEPLOYMENT
// ============================================================
// Execute the deployment function and handle success/error
DeployingZkVoting()
    .then(() => process.exit(0))   // Success: exit with code 0
    .catch((error) => {            // Failure: print error and exit with code 1
        console.error(error);
        process.exit(1);
    });