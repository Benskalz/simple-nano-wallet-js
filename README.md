**Simple Nano Wallet JS**

Simple nano wallet with in memory key managment.  
Made by [Nanswap Nodes](https://nanswap.com/nodes) - Hosted nodes provider

**Features**
- Easily send and receive nano with local signature
- Use your own node or any node provider
- Auto receive blocks of wallet accounts with websocket
- Receive all receivable blocks for an account
- Create wallet from seed or from random entropy
- Create derived accounts
- Suppport custom prefix & decimal for custom network such as Banano or DogeNano


**Installation**  
Using npm
```bash
npm install simple-nano-wallet-js
```
Using yarn
```bash
yarn add simple-nano-wallet-js
```

**Usage:**  
**Create new wallet**
```javascript
const { Wallet } = require('simple-nano-wallet-js');
const { wallet: walletLib} = require('multi-nano-web')

let seed = walletLib.generateLegacy().seed // save & backup it somewhere!
// initialize wallet
const wallet = new Wallet({
            RPC_URL: 'http://127.0.0.1:7076',
            WORK_URL: 'http://127.0.0.1:7076',
            WS_URL: `ws://127.0.0.1:7078`,
            seed: seed,
            defaultRep: "nano_1banexkcfuieufzxksfrxqf6xy8e57ry1zdtq9yn7jntzhpwu4pg4hajojmq",
        })

// Generate 10 derived accounts
let accounts = wallet.createAccounts(10)
// ["nano_3g5hpb4kwqgakt4cx11ftq6xztx1matfhgkmhunj3sx4f4s3nwb6hfi3nts1", ... ]
```

**Auto Receive**  
By default, when a websocket is provided, receivable blocks for all wallet accounts will be processed automatically.  
To disable this feature, set `autoReceive` to false when initializing the wallet.  

**Manually Receive**  
```javascript
// receive all receivable blocks for an account
let hashesReceive = await wallet.receiveAll("nano_3g5hpb4kwqgakt4cx11ftq6xztx1matfhgkmhunj3sx4f4s3nwb6hfi3nts1")
```

**Send**  
```javascript
// send 0.001 nano from nano_3g5hp... to nano_3g5hp...
let hash = await wallet.send({
        fromAccount: "nano_3g5hpb4kwqgakt4cx11ftq6xztx1matfhgkmhunj3sx4f4s3nwb6hfi3nts1", // must be in wallet. 
        toAccount: "nano_3g5hpb4kwqgakt4cx11ftq6xztx1matfhgkmhunj3sx4f4s3nwb6hfi3nts1",
        amount: wallet.megaToRaw(0.001),
})
        
```

**Custom networks**
```javascript
let headerAuth = { // custom header for authentification
     "nodes-api-key": process.env.NODES_API_KEY
}

// DogeNano Wallet
const walletXDG = new Wallet({
            RPC_URL: 'https://nodes.nanswap.com/XDG',
            WORK_URL: 'https://nodes.nanswap.com/XDG',
            WS_URL: `wss://nodes.nanswap.com/ws/?ticker=XDG&api=${process.env.NODES_API_KEY}`,
            seed: seedXDG,
            defaultRep: "xdg_1e4ecrhmcws6kwiegw8dsbq5jstq7gqj7fspjmgiu11q55s6xnsnp3t9jqxf",
            prefix: 'xdg_',
            decimals: 24,
            customHeaders: headerAuth,
            wsSubAll: false, 
        })
// Banano Wallet
const walletBAN = new Wallet({
            RPC_URL: 'https://nodes.nanswap.com/BAN',
            WORK_URL: 'https://nodes.nanswap.com/BAN',
            WS_URL: `wss://nodes.nanswap.com/ws/?ticker=BAN&api=${process.env.NODES_API_KEY}`,
            seed: seedBAN,
            defaultRep: "ban_1banexkcfuieufzxksfrxqf6xy8e57ry1zdtq9yn7jntzhpwu4pg4hajojmq",
            prefix: 'ban_',
            decimals: 29,
            customHeaders: headerAuth,
            wsSubAll: false
        })
```
This lib is intended for small project (<5000 accounts), for a more scablable system, it is recommended to use a database to store the accounts keys.

