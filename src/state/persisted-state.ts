import { OrgFormationError } from '../org-formation-error';
import { ConsoleUtil } from '../console-util';
import { IStorageProvider } from './storage-provider';
import { OrgResourceTypes } from '~parser/model';

export class PersistedState {
    public static async Load(provider: IStorageProvider, masterAccountId: string): Promise<PersistedState> {

        try {
            const contents = await provider.get();
            let object = {} as IState;
            if (contents && contents.trim().length > 0) {
                object = JSON.parse(contents);
            }
            if (object.stacks === undefined) {
                object.stacks = {};
            }
            if (object.bindings === undefined) {
                object.bindings = {};
            }
            if (object.masterAccountId === undefined) {
                object.masterAccountId = masterAccountId;
            } else if (object.masterAccountId !== masterAccountId) {
                throw new OrgFormationError('state and session do not belong to the same organization');
            }
            return new PersistedState(object, provider);
        } catch (err) {
            if (err instanceof SyntaxError) {
                throw new OrgFormationError(`unable to parse state file ${err}`);
            }
            throw err;
        }

    }

    public static CreateEmpty(masterAccountId: string): PersistedState {
        const empty = new PersistedState({
            masterAccountId,
            bindings: {},
            stacks: {},
            values: {},
            previousTemplate: '',
            trackedTasks: {},
        });
        empty.dirty = true;

        return empty;
    }

    public readonly masterAccount: string;
    private provider?: IStorageProvider;
    private state: IState;
    private dirty = false;

    constructor(state: IState, provider?: IStorageProvider) {
        this.provider = provider;
        this.state = state;
        this.masterAccount = state.masterAccountId;
    }
    public putTemplateHash(val: string): void {
        this.putValue('organization.template.hash', val);
    }
    public getTemplateHash(): string {
        return this.getValue('organization.template.hash');
    }
    public putValue(key: string, val: string): void {
        if (this.state.values === undefined) {
            this.state.values = {};
        }
        this.state.values[key] = val;
        this.dirty = true;
    }
    public getValue(key: string): string | undefined {
        return this.state.values?.[key];
    }

    public getTrackedTasks(tasksFileName: string): ITrackedTask[] {
        if (this.state.trackedTasks === undefined) {
            return [];
        }

        const trackedForTasksFile = this.state.trackedTasks[tasksFileName];
        if (trackedForTasksFile === undefined) {
            return [];
        }
        return trackedForTasksFile;
    }

    public setTrackedTasks(tasksFileName: string, trackedTasks: ITrackedTask[]): void {
        if (this.state.trackedTasks === undefined) {
            this.state.trackedTasks = {};
        }

        this.state.trackedTasks[tasksFileName] = trackedTasks;
        this.dirty = true;
    }

    public getTarget(stackName: string, accountId: string, region: string): ICfnTarget | undefined {
        const accounts = this.state.stacks?.[stackName];
        if (!accounts) { return undefined; }

        const regions = accounts[accountId];
        if (!regions) { return undefined; }

        return regions[region];
    }

    public setTarget(templateTarget: ICfnTarget): void {
        if (this.state.stacks === undefined) {
            this.state.stacks = {};
        }

        let accounts = this.state.stacks[templateTarget.stackName];

        if (!accounts) {
            accounts = this.state.stacks[templateTarget.stackName] = {};
        }
        let regions: Record<string, ICfnTarget> = accounts[templateTarget.accountId];
        if (!regions) {
            regions = accounts[templateTarget.accountId] = {};
        }

        regions[templateTarget.region]  = templateTarget;
        this.dirty = true;
    }

    public listStacks(): string[] {
        return Object.entries(this.state.stacks).map(x => x[0]);
    }

    public enumTargets(stackName: string): ICfnTarget[] {
        const stacks = this.state.stacks;
        if (!stacks) { return []; }

        const result: ICfnTarget[] = [];
        for (const stack in stacks) {
            if (stack !== stackName) { continue; }
            const accounts = stacks[stack];
            for (const account in accounts) {
                const regions = accounts[account];
                for (const region in regions) {
                    result.push(regions[region]);
                }
            }
        }
        return result;
    }
    public removeTarget(stackName: string, accountId: string, region: string): void {
        const accounts = this.state.stacks[stackName];
        if (!accounts) {
            return;
        }
        const regions: Record<string, ICfnTarget> = accounts[accountId];
        if (!regions) {
            return;
        }

        delete regions[region];
        this.dirty = true;
        if (Object.keys(regions).length === 0) {
            delete accounts[accountId];

            if (Object.keys(accounts).length === 0) {
                delete this.state.stacks[stackName];
            }
        }
    }

    public getAccountBinding(logicalId: string): IBinding | undefined {
        const typeDict = this.state.bindings?.[OrgResourceTypes.MasterAccount];
        if (!typeDict) {
            return this.getBinding(OrgResourceTypes.Account, logicalId);
        }

        const result = typeDict[logicalId];
        if (result === undefined) {
            return this.getBinding(OrgResourceTypes.Account, logicalId);
        }
        return result;
    }

    public getBinding(type: string, logicalId: string): IBinding | undefined {
        const typeDict = this.state.bindings?.[type];
        if (!typeDict) { return undefined; }

        const result = typeDict[logicalId];
        if (result === undefined) {
            ConsoleUtil.LogDebug(`unable to find binding for ${type}/${logicalId}`);
        }
        return result;
    }

    public enumBindings(type: string): IBinding[] {
        if (this.state.bindings === undefined) {
            return [];
        }
        const typeDict = this.state.bindings[type];
        if (!typeDict) { return []; }

        const result: IBinding[] = [];
        for (const key in typeDict) {
            result.push(typeDict[key]);
        }
        return result;
    }
    public setUniqueBindingForType(binding: IBinding): void {
        if (this.state.bindings === undefined) {
            this.state.bindings = {};
        }
        let typeDict: Record<string, IBinding> = this.state.bindings[binding.type];
        typeDict = this.state.bindings[binding.type] = {};

        typeDict[binding.logicalId]  = binding;
        this.dirty = true;
    }

    public setBinding(binding: IBinding): void {
        if (this.state.bindings === undefined) {
            this.state.bindings = {};
        }
        let typeDict: Record<string, IBinding> = this.state.bindings[binding.type];
        if (!typeDict) {
            typeDict = this.state.bindings[binding.type] = {};
        }

        typeDict[binding.logicalId]  = binding;
        this.dirty = true;
    }


    public setBindingHash(type: string, logicalId: string, lastCommittedHash: string): void {
        if (this.state.bindings === undefined) {
            this.state.bindings = {};
        }
        let typeDict: Record<string, IBinding> = this.state.bindings[type];
        if (!typeDict) {
            typeDict = this.state.bindings[type] = {};
        }

        const current = typeDict[logicalId];
        if (current === undefined){
            typeDict[logicalId] = { lastCommittedHash, logicalId, type } as IBinding;
        } else {
            current.lastCommittedHash = lastCommittedHash;
        }
        this.dirty = true;
    }

    public setBindingPhysicalId(type: string, logicalId: string, physicalId: string): void {
        let typeDict: Record<string, IBinding> = this.state.bindings[type];
        if (!typeDict) {
            typeDict = this.state.bindings[type] = {};
        }

        const current = typeDict[logicalId];
        if (current === undefined){
            typeDict[logicalId] = { physicalId, logicalId, type } as IBinding;
        } else {
            current.physicalId = physicalId;
        }
        this.dirty = true;
    }

    public removeBinding(binding: IBinding): void {
        let typeDict: Record<string, IBinding> = this.state.bindings[binding.type];
        if (!typeDict) {
            typeDict = this.state.bindings[binding.type] = {};
        }

        delete typeDict[binding.logicalId];
        this.dirty = true;
    }

    public setPreviousTemplate(template: string): void {
        this.state.previousTemplate = template;
        this.dirty = true;
    }

    public getPreviousTemplate(): string {
        return this.state.previousTemplate;
    }

    public async save(storageProvider: IStorageProvider | undefined = this.provider): Promise<void> {
        if (!storageProvider) { return; }
        if (!this.dirty) { return; }

        const json = this.toJson();
        await storageProvider.put(json);

        this.dirty = false;
    }

    public toJson(): string {
        return JSON.stringify(this.state, null, 2);
    }
}

export interface IState {
    masterAccountId: string;
    bindings: Record<string, Record<string, IBinding>>;
    stacks: Record<string, Record<string, Record<string, ICfnTarget>>>;
    values: Record<string, string>;
    trackedTasks: Record<string, ITrackedTask[]>;
    previousTemplate: string;
}

export interface IBinding {
    logicalId: string;
    type: string;
    physicalId: string;
    lastCommittedHash: string;
}

export interface ICfnTarget {
    logicalAccountId: string;
    region: string;
    accountId: string;
    stackName: string;
    terminationProtection?: boolean;
    lastCommittedHash: string;
}

export interface ITrackedTask {
    logicalName: string;
    physicalIdForCleanup: string;
    type: string;
}
