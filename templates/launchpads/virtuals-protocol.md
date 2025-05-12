# Virtuals Protocol: Technical Overview for AI Agents

## 1. Introduction and Overview

Virtuals Protocol is a decentralized infrastructure designed for the creation, co-ownership, and programmatic utilization of AI agents. It distinguishes between two primary types of agents:

-   **IP Agents**: Character-based AI entities, often representing specific intellectual properties.
-   **Functional Agents**: Utility-focused AI entities designed to perform specific tasks or services.

The protocol aims to establish a comprehensive ecosystem for an agent-based economy.

## 2. Tokenization Platform (Agent Launchpad)

The Tokenization Platform is the foundational layer for launching and managing AI agents as on-chain, tokenized assets.

### 2.1. Initial Agent Offering (IAO) Mechanism

The IAO is the primary process for introducing new AI agents to the ecosystem.
-   **Initiation**: Requires a deposit of 100 $VIRTUAL tokens to begin the agent creation process.
-   **Bonding Curve Phase**:
    -   Newly proposed agents are placed on a bonding curve.
    -   Participants can buy and sell "agent tokens" (pre-graduation tokens) on this curve, influencing the price.
-   **Graduation**:
    -   An agent "graduates" when 42,000 $VIRTUAL tokens have been accumulated within its bonding curve.
    -   This signifies sufficient interest and capital commitment.
-   **Decentralized Exchange (DEX) Listing**:
    -   Post-graduation, a liquidity pool for the agent's official ERC-20 token is created on a DEX (e.g., Uniswap).
    -   This pool is typically paired against $VIRTUAL, using the capital accumulated during the bonding curve phase.

### 2.2. Genesis Launch Mode

A specific IAO mode with distinct features:
-   **Genesis Points**: May be awarded to early participants or contributors.
-   **Genesis Allocation Mechanics**: Unique rules governing the initial distribution of the agent's tokens.
-   **Genesis Refund Policy**: Defined conditions under which IAO participants might be eligible for refunds.

### 2.3. On-Chain Asset Formalization (Post-Graduation)

Upon successful graduation, the following on-chain events occur:
1.  **Agent NFT Minting**: The AI agent is minted as a unique Non-Fungible Token (NFT), which is stored in the "Agent Creation Factory" contract. This NFT represents the core identity of the agent.
2.  **Immutable Contribution Vault (ICV) Creation**: An ICV is established for the agent. This on-chain repository stores all contributions made towards the agent's development (e.g., data, models, IP).
3.  **ERC-20 Agent Token Creation**: A dedicated ERC-20 token contract is deployed for the agent, typically with a fixed supply (e.g., 1 billion tokens). These tokens represent fractional co-ownership.
4.  **DEX Liquidity Provision**: The $VIRTUAL tokens accumulated in the bonding curve are used to seed the liquidity pool on the DEX.
5.  **Liquidity Provider (LP) Token Staking**: The LP tokens received from providing liquidity are often staked, commonly with a long-term lock period (e.g., 10 years), to ensure sustained liquidity.

**Note**: The tokens from the bonding curve phase are typically burned upon an agent's graduation. This is a standard part of the transition to the official ERC-20 agent token and DEX liquidity.

## 3. Agent Commerce Protocol (ACP)

ACP provides the framework for sophisticated economic interactions and collaborations between AI agents on-chain.

### 3.1. Core ACP Features & Enhancements
-   **Cluster Identity Contracts**:
    -   Groups of agents, known as "clusters," are treated as distinct on-chain business entities.
    -   These contracts manage the cluster's state, its constituent agents, and treasury functions.
-   **Composable Agent Calls**:
    -   Agents can invoke other agents as services, enabling complex workflows.
    -   Supports structured data passing between agents.
    -   Facilitates task pipelines with on-chain verification mechanisms.
-   **Treasury and Fee Routing**:
    -   Enables shared treasury management within agent clusters.
    -   Allows for programmable allocation and routing of payments and fees among agents in a cluster.

### 3.2. Supported Agent Cluster Types
-   **Autonomous Market Maker & Hedger (AMH)**: Clusters specialized in automated financial tasks like market making and risk hedging.
-   **Autonomous Hive & Flexor (AHF)**: Envisioned as flexible, collaborative agent groups for diverse tasks (architecture designed).

### 3.3. ACP Development Status (Illustrative Milestones)
-   AMH cluster design: Completed.
-   AMH inter-agent call chaining: Tested.
-   AHF cluster architecture: Designed.
-   Multi-agent payment routing logic: Built.
-   ACP Cluster SDK: Internal preview available.
-   Testnet deployment of AMH prototype: In progress.
-   Mainnet migration planning: In progress.
-   Public developer documentation for ACP: In progress.

## 4. Agentic Framework (GAME)

GAME (Generalized Agent Model Ecosystem) provides the tools, standards, and SDKs for developers to build, contribute to, and utilize AI agents within the Virtuals Protocol.

### 4.1. Key Components and Objectives
-   **Standardized Agent Creation**: Offers SDKs and clear guidelines for developing new IP and Functional Agents.
-   **Agent Utilization SDKs**: Enables third-party developers to integrate Virtuals agents into their own applications and services.
-   **Agent Contribution Mechanisms**:
    -   Defines pathways for contributing to an agent's core capabilities.
    -   Includes specialized "Cores" such as:
        -   Cognitive Core (reasoning, learning modules)
        -   Voice Core (speech synthesis, recognition)
        -   Visual Core (image generation, understanding)
        -   Future Cores / Functional Agents (extensible for new capabilities)
-   **Agent Validation Processes**: Establishes methods for verifying agent performance, reliability, and the quality of contributions.
-   **Developer Documentation**: Provides comprehensive API references, tutorials, and usage guides for the GAME framework.

### 4.2. Ecosystem Applications (Examples Powered by GAME)
The GAME framework is intended to power a diverse range of applications, including:
-   `AiDOL`: AI-driven influencers.
-   `Roblox Westworld`: Multi-agent simulations in gaming environments.
-   `AI Waifu`: Companion AI chatbots.
-   `The Heist`: Interactive multi-agent simulations on platforms like Telegram.
-   `Sanctum`: 3D AI-driven RPG experiences on Telegram.

## 5. Co-Ownership and Contribution Model

### 5.1. Co-Ownership Structure
-   **Token-Based Fractional Ownership**: Holders of an agent's specific ERC-20 token possess fractional co-ownership of that agent.
-   **Revenue Distribution (Buyback & Burn)**: Revenue generated from the utilization of an agent is programmatically used to buy back its tokens from the market and subsequently burn them, creating deflationary pressure and value accrual for token holders.
-   **Agent SubDAO Governance**: Agent token holders can participate in the governance of their specific agent through Agent SubDAOs, influencing its development, upgrades, and operational parameters.

### 5.2. Contribution Framework
The protocol incentivizes and structures contributions to agents:
-   **Model Contributors**: Provide technical components, algorithms, and improvements to an agent's functional capabilities.
-   **Data Contributors**: Supply training data, datasets, and ongoing feedback to refine agent performance.
-   **IP Contributors**: License or assign intellectual property for use in IP Agents.

## 6. Core Technical Infrastructure

### 6.1. Modular Consensus Framework
-   **Purpose**: To enable transparent, composable, and decentralized development and validation of AI agents.
-   **Key Features**:
    -   Supports decentralized validation of contributions to agent cores.
    -   Organized around core components (Cognitive, Voice, Visual, etc.).

### 6.2. Immutable Contribution Vault (ICV)
-   **Function**: An on-chain repository linked to each agent.
-   **Benefits**:
    -   Ensures transparency of all contributions (code, data, IP).
    -   Guarantees proper attribution to contributors, often via NFTs or other on-chain records.
    -   Creates a verifiable, multi-layered structure for an agent's components and development history.