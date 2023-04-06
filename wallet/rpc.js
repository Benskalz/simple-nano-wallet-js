const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


/**
 * Simple RPC client for Nano node
 */
class RPC {
    constructor(RPC_URL, WORK_URL, customHeaders) {
        this.rpcURL = RPC_URL;
        this.worURL = WORK_URL;
        this.headerAuth = customHeaders;
    }

        account_info = async (account) => {
            let params = {
                "action": "account_info",
                "account": account,
                "representative": "true"
            };
            let r = await this.req(params);
            return r;
        };
        work_generate = async (hash) => {
            let params = {
                "action": "work_generate",
                "hash": hash,
            };

            let r = await this.req(params);
            if (r.work === undefined){
                throw new Error(`work_generate failed on ${this.worURL}: ${JSON.stringify(r)}`)
            }
            return r.work;
        };
        receivable = async (account) => {
            let params = {
                "action": "pending",
                "account": account,
                "threshold": "1"
            };

            // console.log(params);
            let r = await this.req(params);
            // console.log(r);
            return r.blocks;
        };
        process = async (block, subtype) => {
            let params = {
                "action": "process",
                "json_block": "true",
                "subtype": subtype,
                "block": block
            };


            let r = await this.req(params);
            return r;
        };

        req = async (params) => {

            let url = this.rpcURL;
            if (params.action === "work_generate") {
                url = this.worURL;
            }
            let data = await fetch(url, {
                method: "POST",
                headers: this.headerAuth,
                body: JSON.stringify(params)
            });

            // console.log("ratelimit-limit: " + data.headers.get('ratelimit-limit'));
            // console.log("ratelimit-remaining: " + data.headers.get('ratelimit-remaining'));
            // console.log("ratelimit-reset: " + data.headers.get('ratelimit-reset'));
            try {
                data = await data.json();
                return data;

            } catch (error) {
                return { error: error.message };
            }
        };
}

exports.RPC = RPC
