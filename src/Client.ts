/// <reference types="../lib/mw.d.ts" />

import { CookieJar } from 'tough-cookie';
import { CookieAgent } from 'http-cookie-agent/undici';

const MAX_ATTEMPTS = 2;

type priority = "high" | "medium" | "low";

export class Client {
    constructor(path: string){
        this.root = new URL(path);

        this.processQueue = this.processQueue.bind(this);
    }
    private root;

    private agent = new CookieAgent({ cookies: { jar: new CookieJar() } });

    private CSRF: string | null = null;

    private queues: Record<priority, {
        input: URL | RequestInfo;
        init?: RequestInit;
        resolve: (value: Response | PromiseLike<Response>) => void
        reject: (reason?: any) => void
    }[]> = {
        high: [],
        medium: [],
        low: []
    };
    private static readonly queues: priority[] = ['high', 'medium', 'low'];

    private id: string | number | NodeJS.Timeout | null = null;

    private processQueue(){
        for (const priority of Client.queues) {
            const item = this.queues[priority].shift();
            if (item == undefined) continue;
            fetch(item.input, item.init).then(item.resolve).catch(item.reject);
            // if (Client.queues.reduce((accum, priority) => accum + this.queues[priority].length, 0) > 0) {
            //     this.id = setTimeout(this.processQueue, 60_000 / 19);
            // } else {
            //     this.id = null;
            // }
            this.id = setTimeout(this.processQueue, 60_000 / 39);
            return;
        }
        this.id = null;
    }

    private call(priority: priority, input: URL | RequestInfo, init?: RequestInit | undefined): Promise<Response> {
        return new Promise((resolve, reject) => {
            this.queues[priority].push({ input, init, resolve, reject });
            if (this.id == null) this.processQueue();
        })
    }

    async logIn(user: string, password: string) {
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

        const tokendata: API.Query.Tokens.Login.Response = await tokenbody.json();
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

        const data: API.Login.Response | API.Error.Response = await loginbody.json();

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

        const data: API.Query.Tokens.Csrf.Response | API.Error.Response = await body.json();
        if ("error" in data) {
            throw new Error(JSON.stringify(data.error));
        }
        
        const token = data.query.tokens.csrftoken
        return token;
    }

    async uploadFile(file: ArrayBuffer, name: string, content?: string, forced?: boolean){
        const form = new FormData();
        form.append("action", "upload");
        form.append("filename", name);
        form.append("comment", "automatic upload")
        
        if (content) form.append("text", content);
        if (forced) form.append("ignorewarnings", "1");
        
        form.append("format", "json");
        form.append("formatversion", "2");
        
        form.append("file", new Blob([file]))
        
        let data: API.Upload.Response | API.Error.Response;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
        }
        return data!;
    }

    async getImageInfo(titles: string[]){
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

        const data: API.Query.Imageinfo.Response | API.Error.Response = await body.json();

        return data;
    }

    async updatePage(title: string, content: string) {
        const form = new FormData();
        form.append("action", "edit");
        form.append("title", title)
        form.append("text", content);
        
        form.append("bot", "1");
        form.append("format", "json");

        form.append("nocreate", "1")

        let data: API.Edit.Response | API.Error.Response;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
        }
        return data!;
    }

    async updateOrCreatePage(title: string, content: string) {
        const form = new FormData();
        form.append("action", "edit");
        form.append("title", title)
        form.append("text", content);
        
        form.append("bot", "1");
        form.append("format", "json");

        let data: API.Edit.Response | API.Error.Response;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
        }
        return data!;
    }

}