"use client"

import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, Users } from "lucide-react"

type User = { id: string; email: string }
type Business = { id: string; business_name: string }

const fetcher = async (url: string) => {
  const r = await fetch(url, { credentials: "include" })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error || `HTTP ${r.status}`)
  return data
}

export function UserAccessManagement() {
  const { data, error, mutate } = useSWR<{
    users: User[]
    businesses: Business[]
    access: string[]
  }>("/api/edge/admin/user-access", fetcher)

  const hasAccess = (userId: string, businessId: string) =>
    (data?.access || []).includes(`${userId}:${businessId}`)

  const setAccess = async (userId: string, businessId: string, granted: boolean) => {
    const res = await fetch("/api/edge/admin/user-access", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ user_id: userId, business_id: businessId, granted }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Failed to update")
    }
    mutate()
  }

  const handleToggle = (userId: string, businessId: string, checked: boolean) => {
    setAccess(userId, businessId, checked).catch((e) => {
      alert(e instanceof Error ? e.message : "Failed to update access")
    })
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error.message?.includes("403") ? "Admin only." : `Error: ${error.message}`}
        </AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading...</span>
        </CardContent>
      </Card>
    )
  }

  const { users, businesses } = data

  if (users.length === 0 || businesses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            User Access
          </CardTitle>
          <CardDescription>
            Control which users can see which shared businesses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {businesses.length === 0
              ? "No shared businesses yet. Create a business as admin and mark it shared."
              : "No non-admin users yet."}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Access
        </CardTitle>
        <CardDescription>
          Toggle which users can see each shared business. Off = user cannot see the business.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 font-medium">User</th>
              {businesses.map((b) => (
                <th key={b.id} className="text-left py-2 px-2 font-medium min-w-[120px]">
                  {b.business_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/50">
                <td className="py-2 pr-4 text-muted-foreground">{u.email}</td>
                {businesses.map((b) => (
                  <td key={b.id} className="py-2 px-2">
                    <Switch
                      checked={hasAccess(u.id, b.id)}
                      onCheckedChange={(checked) => handleToggle(u.id, b.id, checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
