"use client"; // looks for client browsers
import React from "react"; // makes the return's components around <StarknetConfig> possible

import { sepolia } from "@starknet-react/chains";
import {
  StarknetConfig,
  argent,
  braavos,
  useInjectedConnectors,
  voyager,
  jsonRpcProvider
} from "@starknet-react/core";

export function Providers({ children }: { children: React.ReactNode }) {
  const { connectors } = useInjectedConnectors({
    // Show these connectors if the user has no connector installed.
    recommended: [
      argent(),
      braavos(),
    ],
    // simplify the avoid being too strict
    includeRecommended: "always",
    // Randomize the order of the connectors.
    order: "random"
  });

  return (
    <StarknetConfig
      chains={[sepolia]}
      provider={jsonRpcProvider({rpc: (chain) => ({nodeUrl: process.env.NEXT_PUBLIC_RPC_URL!})})}
      connectors={connectors}
      explorer={voyager}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}


/*



// Providers.tsx = The Restaurant Building
// - Has location (Sepolia network)
// - Has kitchen (Alchemy RPC)
// - Has waiters (Connectors)
// - Has menu (Contract ABI)

// layout.tsx = The Building Entrance
// - Wraps everything
// - "Welcome to the restaurant"

// WalletBar.tsx = The Host Stand
// - "How many people? Connect wallet?"

// page.tsx = The Dining Area
// - Where you actually eat (interact with contract)


* */