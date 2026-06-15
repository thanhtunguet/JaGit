import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Approval } from "@/api/client";
import { decideApproval } from "@/api/client";

interface ApprovalCardProps {
  approval: Approval;
  onResolved: () => void;
}

export function ApprovalCard({ approval, onResolved }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (optionId: string) => {
    setLoading(true);
    setError(null);
    try {
      await decideApproval(approval.id, optionId);
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-orange-500 dark:border-orange-400">
      <CardHeader>
        <CardTitle className="text-sm">⚠️ Approval Required</CardTitle>
        <CardDescription>{approval.kind}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{approval.prompt}</p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2 flex-wrap">
          {approval.options.map((opt) => (
            <Button
              key={opt.optionId}
              size="sm"
              variant={opt.optionId.includes("deny") ? "destructive" : "default"}
              disabled={loading}
              onClick={() => decide(opt.optionId)}
              aria-label={`${opt.name} this approval request`}
            >
              {opt.name}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
