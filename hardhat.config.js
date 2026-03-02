

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Higher runs = more optimization for runtime, lower for deployment
      },
    },
  },
  networks: {
    // Etherlink Mainnet
    etherlinkMainnet: {
      type: 'http',
      url: "https://node.mainnet.etherlink.com",
      chainId: 42793,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },

    // Etherlink Shadownet Testnet (Primary)
    etherlinkTestnet: {
      type: 'http',
      url: "https://node.shadownet.etherlink.com",
      chainId: 127823,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },

    // Etherlink Ghostnet Testnet (Alternative)
    etherlinkGhostnet: {
      type: 'http',
      url: "https://node.ghostnet.etherlink.com",
      chainId: 128123,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },

    // Somnia test net (keeping for reference)
    somniaTestnet: {
      type: 'http',
      url: "https://dream-rpc.somnia.network/",
      chainId: 50312,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};