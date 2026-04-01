type RestoreFn = () => void;
export interface DeterministicHooks {
    seed: number;
    epochMs: number;
    tickMs?: number;
}
export declare function installDeterministicRuntime(hooks: DeterministicHooks): RestoreFn;
export {};
