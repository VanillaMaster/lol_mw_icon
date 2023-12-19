/// <reference types="../../lib/mw.d.ts" />

import { CookieJar } from 'tough-cookie';
import { CookieAgent } from 'http-cookie-agent/undici';

const MAX_ATTEMPTS = 1;

/**@typedef { "high" | "medium" | "low" } priority */

export class Client {
    /**
     * @param { string } path 
     */
    constructor(path){
        this.root = new URL(path);

        this.processQueue = this.processQueue.bind(this);
    }
    /**@private */
    root;
    /**@private */
    agent = new CookieAgent({ cookies: { jar: new CookieJar() } });

    /**
     * @private
     * @type { string | null }
     */
    CSRF = null;

    /**
     * @typedef queueItem
     * @property { URL | RequestInfo } input
     * @property { RequestInit } [init]
     * @property { (value: Response | PromiseLike<Response>) => void } resolve
     * @property { (reason?: any) => void } reject
     * 
     * @private
     * @type { Record<priority, queueItem[]> }
     */
    queues = {
        high: [],
        medium: [],
        low: []
    };

    /**
     * @private
     * @readonly
     * @type { priority[] }
     */
    static queues = ['high', 'medium', 'low'];

    /**
     * @private
     * @type { string | number | NodeJS.Timeout | null }
     */
    id = null;

    /**@private */
    processQueue(){
        for (const priority of Client.queues) {
            const item = this.queues[priority].shift();
            if (item == undefined) continue;
            fetch(item.input, item.init).then(item.resolve).catch(item.reject);
            this.id = setTimeout(this.processQueue, 60_000 / 39);
            return;
        }
        this.id = null;
    }

    /**
     * @private
     * @param { priority } priority 
     * @param { URL | RequestInfo } input 
     * @param { RequestInit } [init] 
     * @returns { Promise<Response> }
     */
    call(priority, input, init) {
        return new Promise((resolve, reject) => {
            this.queues[priority].push({ input, init, resolve, reject });
            if (this.id == null) this.processQueue();
        })
    }

    /**
     * 
     * @param { string } user 
     * @param { string } password 
     * @returns 
     */
    async logIn(user, password) {
        const url = new URL(this.root);
        url.searchParams.append("action", "query");
        url.searchParams.append("meta", "tokens");
        url.searchParams.append("type", "login");
        url.searchParams.append("format", "json");
        url.searchParams.append("formatversion", "2")

        const tokenbody = await this.call("high", url, {
            dispatcher: this.agent,
            method: "GET",
        });

        /**@type { API.Query.Tokens.Login.Response } */
        const tokendata = await tokenbody.json();
        const token = tokendata.query.tokens.logintoken;

        const form = new FormData();
        form.append("action", "login");
        form.append("lgname", user);
        form.append("lgpassword", password);
        form.append("lgtoken", token);
        form.append("format", "json");
        form.append("formatversion", "2");

        const loginbody = await this.call("high", this.root, {
            dispatcher: this.agent,
            method: "POST",
            body: form
        })
        /**@type { API.Login.Response | API.Error.Response } */
        const data = await loginbody.json();

        return data;
    }

    async getCSRFToken() {
        const url = new URL(this.root);
        url.searchParams.append("action", "query");
        url.searchParams.append("meta", "tokens");

        url.searchParams.append("format", "json");
        url.searchParams.append("formatversion", "2")

        
        const body = await this.call("high", url, {
            dispatcher: this.agent,
            method: "GET",
        });
        /**@type { API.Query.Tokens.Csrf.Response | API.Error.Response } */
        const data = await body.json();
        if ("error" in data) {
            throw new Error(JSON.stringify(data.error));
        }
        
        const token = data.query.tokens.csrftoken
        return token;
    }

    /**
     * @param { ArrayBuffer } file 
     * @param { string } name 
     * @param { string } [content] 
     * @param { boolean } [forced] 
     * @returns 
     */
    async uploadFile(file, name, content, forced){
        const form = new FormData();
        form.append("action", "upload");
        form.append("filename", name);
        form.append("comment", "automatic upload")
        
        if (content) form.append("text", content);
        if (forced) form.append("ignorewarnings", "1");
        
        form.append("format", "json");
        form.append("formatversion", "2");
        
        form.append("file", new Blob([file]))
        /**@type { API.Upload.Response | API.Error.Response } */
        let data;
        let attempt = MAX_ATTEMPTS;
        do {
            if (this.CSRF == null) {
                this.CSRF = await this.getCSRFToken();
            }
            form.append("token", this.CSRF);
    
            const body = await this.call("medium", this.root, {
                dispatcher: this.agent,
                method: "POST",
                body: form
            });
    
            data = await body.json();
            if (!("error" in data && data.error.code == "badtoken")) return data;
            this.CSRF = null;
        } while (attempt-- > 0);
        
        return data;
    }

    /**
     * @param { string[] } titles 
     * @returns 
     */
    async getImageInfo(titles){
        const url = new URL(this.root);
        url.searchParams.append("action", "query");
        url.searchParams.append("prop", "imageinfo");

        url.searchParams.append("iiprop", ["sha1", "url"].join("|"));
        
        url.searchParams.append("iilimit", "1");
        url.searchParams.append("format", "json");
        url.searchParams.append("titles", titles.join("|"))
        
        url.searchParams.append("formatversion", "2")

        const body = await this.call("medium", url, {
            dispatcher: this.agent,
            method: "GET",
        });

        /**@type { API.Query.Imageinfo.Response | API.Error.Response } */
        const data = await body.json();

        return data;
    }

    /**
     * @param { string } title 
     * @param { string } content 
     * @returns 
     */
    async updatePage(title, content) {
        const form = new FormData();
        form.append("action", "edit");
        form.append("title", title)
        form.append("text", content);
        
        form.append("bot", "1");
        form.append("format", "json");

        form.append("nocreate", "1")
        /**@type { API.Edit.Response | API.Error.Response } */
        let data;
        let attempt = MAX_ATTEMPTS;
        do {
            if (this.CSRF == null) {
                this.CSRF = await this.getCSRFToken();
            }
            form.append("token", this.CSRF)

            const body = await this.call("medium", this.root, {
                dispatcher: this.agent,
                method: "POST",
                body: form
            });

            data = await body.json();
            if (!("error" in data && data.error.code == "badtoken")) return data;
            this.CSRF = null;
        } while (attempt-- > 0);
        
        return data;
    }

    /**
     * @param { string } title 
     * @param { string } content 
     * @returns 
     */
    async updateOrCreatePage(title, content) {
        const form = new FormData();
        form.append("action", "edit");
        form.append("title", title)
        form.append("text", content);
        
        form.append("bot", "1");
        form.append("format", "json");
        /**@type { API.Edit.Response | API.Error.Response } */
        let data;
        let attempt = MAX_ATTEMPTS;
        do {
            if (this.CSRF == null) {
                this.CSRF = await this.getCSRFToken();
            }
            form.append("token", this.CSRF)

            const body = await this.call("medium", this.root, {
                dispatcher: this.agent,
                method: "POST",
                body: form
            });

            data = await body.json();
            if (!("error" in data && data.error.code == "badtoken")) return data;
            this.CSRF = null;
        } while (attempt-- > 0);

        return data;
    }

}