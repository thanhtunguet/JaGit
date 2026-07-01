import { useState, useEffect } from "react";
import { getLatestUpload, type UsageData } from "@/api/client.js";

export type Period = "Today" | "7 Days" | "30 Days";

export interface UsageDataResult {
  data: UsageData | null;
  loading: boolean;
  error: string | null;
}

export function useUsageData(username: string | null, period: Period): UsageDataResult {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    getLatestUpload(username)
      .then((upload) => {
        if ("data" in upload && upload.data === null) {
          setData(null);
          return;
        }
        const uploadData = upload as { data: UsageData };
        const filtered: UsageData = {
          summary: uploadData.data.summary.filter((r) => r.Period === period),
          daily: uploadData.data.daily.filter((r) => r.Period === period),
          activity: uploadData.data.activity.filter((r) => r.Period === period),
          models: uploadData.data.models.filter((r) => r.Period === period),
          projects: uploadData.data.projects,
          sessions: uploadData.data.sessions,
          tools: uploadData.data.tools,
          shellCommands: uploadData.data.shellCommands,
        };
        setData(filtered);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [username, period]);

  return { data, loading, error };
}
