"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Challenged = { factKey: string; label: string; from: string; to: string };

// Sending a value that newer evidence contradicts is allowed, but never by accident.
export function AcknowledgeDialog({ challenged, busy, onEdit, onSend }: {
  challenged: Challenged[] | null; busy: boolean; onEdit: () => void; onSend: () => void;
}) {
  return (
    <Dialog open={challenged !== null} onOpenChange={(open) => { if (!open) onEdit(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send it as written?</DialogTitle>
          <DialogDescription>This draft states a value that newer evidence contradicts.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm" data-testid="challenged">
          {challenged?.map((c) => (
            <li key={c.factKey} className="rounded-md border bg-muted/40 px-3 py-2">
              <span className="font-medium">{c.label}</span>: the draft says <b>{c.from}</b>; newer evidence says <b>{c.to}</b>.
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onEdit} disabled={busy}>Edit the draft</Button>
          <Button onClick={onSend} disabled={busy}>Send as written</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
