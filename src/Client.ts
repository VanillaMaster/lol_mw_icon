import { CookieJar } from 'tough-cookie';
import { CookieAgent } from 'http-cookie-agent/undici';

// import { createHash } from "node:crypto";

export class Client {
    constructor(path: string){
        this.#root = new URL(path);
    }
    #root;

    #agent = new CookieAgent({ cookies: { jar: new CookieJar() } });

    /**
     * https://www.mediawiki.org/wiki/API:Login#JavaScript
     */
    async logIn(user: string, password: string) {
        let url = new URL(this.#root);
        url.searchParams.append("action", "query");
        url.searchParams.append("meta", "tokens");
        url.searchParams.append("type", "login");
        url.searchParams.append("format", "json");
        url.searchParams.append("formatversion", "2")

        let body = await fetch(url, {
            dispatcher: this.#agent,
            method: "GET",
        });

        let data: any = await body.json();
        const token = data.query.tokens.logintoken;

        const form = new FormData();
        form.append("action", "login");
        form.append("lgname", user);
        form.append("lgpassword", password);
        form.append("lgtoken", token);
        form.append("format", "json");
        form.append("formatversion", "2");

        body = await fetch(this.#root, {
            dispatcher: this.#agent,
            method: "POST",
            body: form
        })

        data = await body.json();

        return data;
    }

    async getCSRFToken(){
        const url = new URL(this.#root);
        url.searchParams.append("action", "query");
        url.searchParams.append("meta", "tokens");

        url.searchParams.append("format", "json");
        url.searchParams.append("formatversion", "2")

        let body = await fetch(url, {
            dispatcher: this.#agent,
            method: "GET",
        });

        const data: any = await body.json();
        const token = data.query.tokens.csrftoken

        return token;
    }

    async uploadFile(token: string, file: ArrayBuffer, name: string, content: string){
        const form = new FormData();
        form.append("action", "upload");
        form.append("filename", name);
        form.append("token", token);
        form.append("comment", "automatic upload")
        form.append("text", content);
        
        // form.append("ignorewarnings", "1");
        form.append("format", "json");
        form.append("formatversion", "2");

        form.append("file", new Blob([file]))

        const body = await fetch(this.#root, {
            dispatcher: this.#agent,
            method: "POST",
            body: form
        });

        const data = await body.json();

        return data;
    }

    async updateFile(token: string, file: ArrayBuffer, name: string){
        const form = new FormData();
        form.append("action", "upload");
        form.append("filename", name);
        form.append("token", token);
        form.append("comment", "automatic upload")
        
        form.append("ignorewarnings", "1");
        form.append("format", "json");
        form.append("formatversion", "2");

        form.append("file", new Blob([file]))

        const body = await fetch(this.#root, {
            dispatcher: this.#agent,
            method: "POST",
            body: form
        });

        const data = await body.json();

        return data;
    } 

    async getImageInfo(titles: string[]){
        const url = new URL(this.#root);
        url.searchParams.append("action", "query");
        url.searchParams.append("prop", "imageinfo");

        url.searchParams.append("iiprop", ["sha1"].join("|"));
        
        url.searchParams.append("iilimit", "1");
        url.searchParams.append("format", "json");
        url.searchParams.append("titles", titles.join("|"))
        
        url.searchParams.append("formatversion", "2")

        const body = await fetch(url, {
            dispatcher: this.#agent,
            method: "GET",
        });

        const data:any = await body.json();

        return data;
    }


    async getPage(title: string){
        const url = new URL(this.#root);
        url.searchParams.append("action", "query");
        url.searchParams.append("prop", "revisions");
        url.searchParams.append("rvprop", ["content"].join("|"));
        url.searchParams.append("rvslots", "*");
        url.searchParams.append("rvdir", "older");
        url.searchParams.append("rvlimit", "1");
        url.searchParams.append("format", "json");
        url.searchParams.append("titles", title)
        
        url.searchParams.append("formatversion", "2")

        const body = await fetch(url, {
            dispatcher: this.#agent,
            method: "GET",
        });

        const data = await body.json();

        return data;
    }

    async createPage(token: string, title: string, content: string){
        const form = new FormData();
        form.append("action", "edit");
        form.append("token", token)
        form.append("title", title)
        form.append("text", content);

        form.append("bot", "1");
        form.append("format", "json");

        form.append("createonly", "1")

        const body = await fetch(this.#root, {
            dispatcher: this.#agent,
            method: "POST",
            body: form
        });

        const data = await body.json();

        return data;
    }

    async updatePage(token: string, title: string, content: string){
        const form = new FormData();
        form.append("action", "edit");
        form.append("token", token)
        form.append("title", title)
        form.append("text", content);

        form.append("bot", "1");
        form.append("format", "json");

        form.append("nocreate", "1")

        const body = await fetch(this.#root, {
            dispatcher: this.#agent,
            method: "POST",
            body: form
        });

        const data = await body.json();

        return data;
    }

    async updateOrCreatePage(token: string, title: string, content: string) {
        const form = new FormData();
        form.append("action", "edit");
        form.append("token", token)
        form.append("title", title)
        form.append("text", content);

        form.append("bot", "1");
        form.append("format", "json");

        const body = await fetch(this.#root, {
            dispatcher: this.#agent,
            method: "POST",
            body: form
        });

        const data = await body.json();

        return data;
    }

}