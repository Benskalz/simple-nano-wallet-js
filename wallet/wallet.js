const { wallet: walletLib, block } = require('multi-nano-web')
const { RPC } = require('./rpc')
var AsyncLock = require('async-lock');
const { default: BigNumber } = require('bignumber.js');
var lock = new AsyncLock();
const WS = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');

class Wallet {
    /**
     * Simple wallet for Nano with in memory external key management
     * Suppport custom prefix & decimal to allows custom nano network (eg: banano, dogenano, etc)
     * 
     * @param {String} RPC_URL Node RPC URL
     * @param {String} WORK_URL Work server URL for work_generate
     * @param {String} WS_URL Node Websocket URL
     * @param {String} [seed] Default seed, use create to create new seed
     * @param {String} defaultRep Default representative for openBlock
     * @param {Boolean} [autoReceive=true] Auto receive when receive websocket confirmation
     * @param {String} [prefix=nano] Prefix for addresses, eg: nano, ban, xdg
     * @param {Number} [decimal=30] Number of decimal, eg: 1 nano = 10^30 raw, 1 banano = 10^29 raw, 1 xdg = 10^24 raw
     * @param {Object} [customHeaders={}] Custom headers for RPC requests
     * @param {Boolean} [wsSubAll=true] If true, subscribe to all websocket confirmation
     * @param {Number} [connectionTimeout=0] Pour fermer automatiquement la connection ws
     * 
     */

    constructor({ 
        RPC_URL, 
        WORK_URL, 
        WS_URL, 
        seed,
        defaultRep, 
        autoReceive = true,
        prefix = "nano_",  
        decimal = 30, 
        customHeaders = {}, 
        wsSubAll = false, 
        connectionTimeout = 0, // 1 minute par défaut
    }) {
        this.mapAccounts = new Map();
        this.lastIndex = 0;
        this.seed = seed;
        this.prefix = prefix;
        this.decimal = decimal;
        this.defaultRep = defaultRep;
        let rpcHeader = {
        "Content-Type": "application/json",
        };
        rpcHeader = Object.assign(rpcHeader, customHeaders);
        this.rpc = new RPC(RPC_URL, WORK_URL, rpcHeader);
        this.websocket = null;

        if (WS_URL !== undefined) {
        this.websocket = new ReconnectingWebSocket(WS_URL, [], { WebSocket: WS });
        this.websocket.onerror = (err) => {
            console.log("Cannot connect to websocket");
            console.log(err.message);
        };
        this.websocket.onmessage = async (msg) => {
            let data_json = JSON.parse(msg.data);
            this.wsOnMessage(data_json);
            if (autoReceive) {
            this.wsAutoReceiveSend(data_json);
            }
        };
        if (wsSubAll) {
            this.subscribeConfirmation();
        } else if (this.mapAccounts.size > 0) {
            this.subscribeConfirmation(Array.from(this.mapAccounts.keys()));
        }
        }

        // Fermer la connexion WebSocket après une durée spécifiée
        if (connectionTimeout !== 0) {
            setTimeout(() => {
            if (this.websocket && this.websocket.readyState === WS.OPEN) {
                this.websocket.close();
                console.log("WebSocket connection closed due to timeout");
            }
            }, connectionTimeout);
        }
    }

    /**
     * subscribe to all websocketconfirmation or to a list of accounts if provided
     * @param {[string]} accounts List of accounts to subscribe to confirmation
     */
    subscribeConfirmation = (accounts)  => {
        const confirmation_subscription = {
            "action": "subscribe",
            "topic": "confirmation",
            "ack": true,
        }
        if (accounts !== undefined) {
            confirmation_subscription["options"] = {
                "accounts": accounts
            }
        }   
        this.websocket.send(JSON.stringify(confirmation_subscription));
    }

    /**
     * @typedef {Object} Wallet
     * @property {string} seed - Wallet seed
     * @property {number} address - Wallet first address
     */

    /**
     * Create a new in memory wallet from random entropy
     * Make sure to save the seed returned!
     * @returns {Wallet} 
     * 
     */
    createWallet = () => {
        let wallet = walletLib.generateLegacy();
        this.seed = wallet.seed;
        this.createAccounts(1);
        return {
            seed: wallet.seed,
            address: wallet.accounts[0].address.replace("nano_", this.prefix)
        };
    };

    /**
     * create new in memory accounts derived from the seed
     * @param {[string]} nbAccounts Number of accounts to create
     * @returns {[string]} Array of addresses
     */
    createAccounts = (nbAccounts) => {
        if (this.seed === undefined) {
            throw new Error("No seed defined. Create a wallet first with createWallet() or use a seed in the wallet constructor");
        }
        let accounts = walletLib.legacyAccounts(this.seed, this.lastIndex, this.lastIndex + nbAccounts);
        this.lastIndex += nbAccounts;
        accounts.forEach((account) => {
            account["address"] = account.address.replace("nano_", this.prefix);
            this.mapAccounts.set(account.address, account);
        });
        let addresses = accounts.map((account) => account.address);
        if (this.websocket !== undefined){
            this.subscribeConfirmation(addresses)
        }
        return addresses;
    };

    
    /**
     * Send amount from source to destination.
     * source must be in the wallet 
     * @param {string} source
     * @param {string} destination
     * @param {string} amount Amount in RAW
     * @returns {Object} RPC response, eg: {"hash": "ABCABCABC"}
     */
    send = async ({ source, destination, amount }) => {
        // we put a lock on source to allows concurrent send to be executed synchronously
        // otherwise concurrent sends would create fork or bad blocks
        return lock.acquire(source, async () => { 
            const account_info = await this.rpc.account_info(source);
            if (account_info.error !== undefined) {
                return { error: account_info.error };
            }
            const data = {
                walletBalanceRaw: account_info.balance,
                fromAddress: source,
                toAddress: destination,
                representativeAddress: account_info.representative,
                frontier: account_info.frontier, // Previous block
                amountRaw: amount, // The amount to send in RAW
                work: await this.rpc.work_generate(account_info.frontier),
            };

            let pk = this.getPrivateKey(source);
            const signedBlock = block.send(data, pk); // Returns a correctly formatted and signed block ready to be sent to the blockchain
            let r = await this.rpc.process(signedBlock, "send");
            return r;

        });
    };

    receive = async (account, pendingTx) => {
        return lock.acquire(account, async () => {

            const privateKey = this.getPrivateKey(account);
            const account_info = await this.rpc.account_info(account);
            let data = {
                toAddress: account,
                transactionHash: pendingTx.hash,
                amountRaw: pendingTx.amount,
            };
            if (account_info.error === "Account not found") { // open block
                data["walletBalanceRaw"] = "0";
                data["representativeAddress"] = this.defaultRep; // default rep
                data["frontier"] = "0000000000000000000000000000000000000000000000000000000000000000";
                data['work'] = await this.rpc.work_generate(this.getPublicKey(account));
            }
            else { // normal receive
                data["walletBalanceRaw"] = account_info.balance;
                data["representativeAddress"] = account_info.representative;
                data["frontier"] = account_info.frontier;
                data['work'] = await this.rpc.work_generate(account_info.frontier);
            }
            
            const signedBlock = block.receive(data, privateKey); // Returns a correctly formatted and signed block ready to be sent to the blockchain
            let r = await this.rpc.process(signedBlock, "receive");
            return r;
        });
    };
    receiveAll = async (account) => {
        let hashes = await this.rpc.receivable(account);
        for (const hash in hashes) {
            const pendingTx = {
                hash: hash,
                amount: hashes[hash]
            };
            this.receive(account, pendingTx);
        }
        return {"started": true}
    };
    getAccounts = () => {
        return Array.from(this.mapAccounts.keys());
    };
    getAccount = (address) => {
        return this.mapAccounts.get(address);
    };

    getPrivateKey = (address) => {
        let account = this.mapAccounts.get(address);
        if (account === undefined) {
            throw new Error(address + " not found in wallet");
        }
        return account.privateKey;
    };
    getPublicKey = (address) => {
        let account = this.mapAccounts.get(address);
        if (account === undefined) {
            throw new Error(address + " not found in wallet");
        }
        return account.publicKey;
    };

    megaToRaw = function (amount) {
        let value = new BigNumber(amount.toString());
        return value.shiftedBy(this.decimal).toFixed(0);
    };
    rawToMega = function (amount) {
        let value = new BigNumber(amount.toString());
        return value.shiftedBy(-(this.decimal)).toFixed(this.decimal, 1);
    };
    wsAutoReceiveSend = async function (data_json) {
        if (data_json.topic === "confirmation" && data_json.message !== undefined && data_json.message.block.subtype === "send") {
            let pendingTx = {
                hash: data_json.message.hash,
                amount: data_json.message.amount,
            }
            let accountDb = this.getAccount(data_json.message.block.link_as_account)
            if (accountDb === null || accountDb === undefined) {
                return
            }
            // console.log("Receiving new send on : " + data_json.message.block.link_as_account)
            let pk = accountDb.privateKey
            let pubk = accountDb.publicKey
            let received = await this.receive(data_json.message.block.link_as_account, pendingTx, pk, pubk)
            // console.log(received)

        }
    }
    wsOnMessage = async function (data_json) {
        return
    }


}

exports.Wallet = Wallet
