"use client"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface ToolApprovalCardProps {
  toolName: string
  input: { path: string; value: unknown }
  approvalId: string
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

export function ToolApprovalCard({
  toolName,
  input,
  approvalId,
  onApprove,
  onReject,
}: ToolApprovalCardProps) {
  const preview =
    typeof input.value === "string"
      ? input.value
      : JSON.stringify(input.value, null, 2)

  return (
    <Card className="ml-11">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {toolName}
          </Badge>
          <Badge className="text-xs">Approval needed</Badge>
        </div>
        <CardTitle className="text-sm font-medium">
          Update <code className="rounded bg-muted px-1 text-xs">{input.path}</code>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
          {preview}
        </pre>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" onClick={() => onApprove(approvalId)}>
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={() => onReject(approvalId)}>
          Reject
        </Button>
      </CardFooter>
    </Card>
  )
}
