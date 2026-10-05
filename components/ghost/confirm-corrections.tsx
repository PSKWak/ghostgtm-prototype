"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Proposal = { factKey: string; label: string; from: string; to: string };

// Rule 7: the rep's edit becomes a fact only through this explicit confirm.
export function ConfirmCorrections({ proposals, account, busy, onCancel, onConfirm }: {
  proposals: Proposal[] | null; account: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={proposals !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update {account}&apos;s record?</DialogTitle>
          <DialogDescription>Your edit changes a fact Ghost relies on. Confirming fixes it for every future draft, not just this email.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm" data-testid="proposals">
          {proposals?.map((p) => (
            <li key={p.factKey} className="rounded-md border bg-muted/40 px-3 py-2">
              <span className="font-medium">{p.label}</span>:{" "}
              <span className="text-muted-foreground line-through">{p.from}</span> → <span className="font-semibold">{p.to}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Ghost also saves this as a regression test and checks the next draft against it.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Keep editing</Button>
          <Button onClick={onConfirm} disabled={busy}>Confirm & send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
