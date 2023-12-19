declare namespace API {
    export namespace Error {
        
        interface baseError {
            code: string;
        }

        interface readonlyError extends baseError {
            code: "readonly";
            info: string;
            readonlyreason: string;
        }

        interface fileexistsNoChangeError extends baseError {
            code: "fileexists-no-change";
        }

        interface badtokenError extends baseError {
            code: "badtoken";
        }

        export interface Response {
            error: (
                readonlyError |
                fileexistsNoChangeError |
                badtokenError
            )
        }

    }
    export namespace Query {

        export namespace Tokens {
            export namespace Login {
                export type Response = {
                    batchcomplete: boolean;
                    query: {
                        tokens: {
                            logintoken: string
                        }
                    }
                }
            }
            export namespace Csrf {
                export type Response = {
                    batchcomplete: boolean;
                    query: {
                        tokens: {
                            csrftoken: string
                        }
                    }
                }
            }
        }

        export namespace Imageinfo {
            export type Response = {
                batchcomplete: boolean;
                query: {
                    pages: Array<{
                        title: string;
                        missing?: true;
                    } & ({
                        missing: true;
                    } | {
                        missing: undefined;
                        imageinfo: Array<{
                            sha1: string;
                            url: string;
                        }>;
                    })>
                }
            }
        }

    }
    export namespace Login {
        export type Response = {
            login: {
                result: string;
            } & ({
                result: "Success"
                lguserid: number;
                lgusername: string;
            } | {
                result: "Failed";
                reason: string;
            })
        }
    }
    export namespace Upload {
        export type Response = {
            upload: {
                result: string;
            } & ({
                result: "Success"
            } | {
                result: "Warning",
                warnings: {
                    [warning: string]: any
                }
            })
        } 
    }
    export namespace Edit {
        export type Response = {
            edit: {
                contentmodel: string;
                pageid: number;
                result: string;
                title: string;
                nochange?: "";
            } & ({
                result: "Success"
            })
        }
    }
}