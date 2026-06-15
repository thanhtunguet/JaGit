export interface IssueData {
  key: string;
  type: string;
  summary: string;
  description: string;
}

export interface MrResult {
  webUrl: string;
  iid: number;
}

export interface IJiraAdapter {
  getIssue(key: string): Promise<IssueData>;
  addWorklog(key: string, text: string): Promise<void>;
}

export interface IGitlabAdapter {
  cloneUrlWithToken(projectId: string): string;
  openMergeRequest(opts: {
    projectId: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
  }): Promise<MrResult>;
}

export interface IGitAdapter {
  clone(url: string, workdir: string): Promise<void>;
  createBranch(workdir: string, branch: string): Promise<void>;
  hasChanges(workdir: string): Promise<boolean>;
  commitAll(workdir: string, message: string): Promise<void>;
  push(workdir: string, branch: string): Promise<void>;
}

/** Sink for writing JobStep/JobEvent rows + updating job status */
export interface IJobSink {
  setStatus(jobId: string, status: string, error?: string): Promise<void>;
  startStep(jobId: string, stepName: string): Promise<string>; // returns stepId
  finishStep(stepId: string, status: "done" | "failed", detail?: object): Promise<void>;
  addEvent(jobId: string, opts: {
    type: string;
    message: string;
    level?: string;
    payload?: object;
  }): Promise<void>;
}

export interface ISignals {
  shouldStop(jobId: string): boolean;
  shouldPause(jobId: string): boolean;
}
