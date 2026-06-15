import { useEffect, useState } from "react";
import { listJobs, type Job } from "@/api/client";
import { JobsTable } from "@/components/JobsTable";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => listJobs().then(setJobs).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Jobs</h2>
      <JobsTable jobs={jobs} onActionComplete={refresh} onError={setError} />
    </div>
  );
}
