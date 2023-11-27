type priority = "high" | "medium" | "low";
type awaitable<T> = T extends Promise<any> ? T : Promise<T>;

type QueueEntry = {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    fn: () => unknown;
}

export class Limiter {
    constructor({ minTime, maxConcurrent = 1 }: { minTime: number, maxConcurrent?: 1 }){
        this.delay = minTime;
        this.processEntry = this.processEntry.bind(this);
    }
    private delay;

    private id: string | number | NodeJS.Timeout | null = null;

    static priorities: priority[] = ["high", "medium", "low"];
    private queues: Record<priority, QueueEntry[]> = {
        high: [],
        medium: [],
        low: []
    };

    schedule<T extends () => unknown>(fn: T, priority: priority = "medium"): awaitable<ReturnType<T>> {
        return new Promise((resolve, reject) => {
            this.queues[priority].push({ reject, resolve, fn });
            if (this.id == null) {
                this.processEntry();
                this.id = setInterval(this.processEntry, this.delay);
                
            }
        }) as awaitable<ReturnType<T>>;
    }

    private processEntry() {
        for (const priority of Limiter.priorities) {
            const last = this.queues[priority].shift();
            if (last) {
                Promise.resolve(last.fn()).then(last.resolve).catch(last.reject);
                return;
            }
        }
        //@ts-ignore
        clearInterval(this.id);
        this.id = null;
    }
}