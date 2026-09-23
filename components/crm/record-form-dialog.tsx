"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type FormField =
  | {
      name: string;
      label: string;
      type: "text" | "email" | "tel" | "number" | "date" | "textarea";
      required?: boolean;
      placeholder?: string;
      hint?: string;
    }
  | {
      name: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      required?: boolean;
      hint?: string;
    };

// The action shapes vary per entity; this component only needs "call it with an
// object and read back a result", so the loose signature is deliberate.
// biome-ignore lint/suspicious/noExplicitAny: generic over every entity's action
type AnyAction = any;

/**
 * One dialog form driven by a field list, shared by every CRM entity.
 *
 * Server-side Zod errors are mapped back onto their fields, so validation is
 * declared once in lib/validators and surfaces in the UI without a second
 * client-side copy of the rules.
 */
export function RecordFormDialog({
  title,
  description,
  trigger,
  fields,
  action,
  defaultValues = {},
  hiddenValues = {},
  submitLabel = "Save",
  successMessage = "Saved",
  onDone,
}: {
  title: string;
  description?: string;
  trigger: React.ReactNode;
  fields: FormField[];
  action: AnyAction;
  defaultValues?: Record<string, string | number | null | undefined>;
  hiddenValues?: Record<string, string>;
  submitLabel?: string;
  successMessage?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { execute, isPending, result, reset } = useAction(action, {
    onSuccess() {
      toast.success(successMessage);
      setFormError(null);
      setOpen(false);
      reset();
      router.refresh();
      onDone?.();
    },
    onError({ error }) {
      // `action` is intentionally loosely typed, so serverError widens to {}.
      setFormError((error.serverError as string | undefined) ?? "Something went wrong.");
    },
  });

  const validationErrors = result?.validationErrors as
    | Record<string, { _errors?: string[] } | undefined>
    | undefined;

  const errorFor = (name: string) => validationErrors?.[name]?._errors?.[0];

  // Shared by onOpenChange (Escape, backdrop click) and the Cancel button, so
  // cancelling doesn't leave a stale error behind for the next time this opens.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFormError(null);
      reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const payload: Record<string, unknown> = { ...hiddenValues };
            for (const field of fields) {
              payload[field.name] = data.get(field.name) ?? "";
            }
            execute(payload);
          }}
        >
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {fields.map((field) => {
            const error = errorFor(field.name);
            const defaultValue = defaultValues[field.name];

            return (
              <div key={field.name} className="grid gap-2">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </Label>

                {field.type === "select" ? (
                  <Select
                    name={field.name}
                    defaultValue={defaultValue != null ? String(defaultValue) : undefined}
                  >
                    <SelectTrigger id={field.name}>
                      <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "textarea" ? (
                  <Textarea
                    id={field.name}
                    name={field.name}
                    rows={4}
                    placeholder={field.placeholder}
                    defaultValue={defaultValue != null ? String(defaultValue) : undefined}
                  />
                ) : (
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    required={field.required}
                    defaultValue={defaultValue != null ? String(defaultValue) : undefined}
                  />
                )}

                {error ? (
                  <p className="text-xs text-destructive">{error}</p>
                ) : field.hint ? (
                  <p className="text-xs text-muted-foreground">{field.hint}</p>
                ) : null}
              </div>
            );
          })}

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
