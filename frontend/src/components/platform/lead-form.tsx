"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { Field, inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getJson, postJson } from "@/lib/client-api";
import { EMPTY_LEAD, leadSchema, type LeadValues } from "@/lib/lead-schema";

const LABELS: Record<keyof LeadValues, string> = {
  school_name: "School name",
  town: "Town",
  contact_name: "Your name",
  phone: "Mobile number",
  email: "Email",
  message: "Message",
  data_consent: "Agreement",
};
const OFFLINE = "We couldn't send your request. Please check your connection and try again.";
const isField = (name: string): name is keyof LeadValues => name in EMPTY_LEAD;

/** "Get your school online" (amendment §6), with the enquiry form's spam protection. */
export function LeadForm({ platformName }: { platformName: string }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<LeadValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: EMPTY_LEAD,
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: false, // the error summary takes focus instead (spec §8.7)
  });
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<LeadValues | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const handledFocusRequest = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<{ token: string }>("/api/public/enquiries/form-token").then(
      (data) => {
        if (!cancelled) setToken(data.token);
      },
      () => {
        if (!cancelled) setFormError(OFFLINE);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  // Focus the error summary on the first commit where it exists (spec §8.7).
  useEffect(() => {
    if (focusRequest > handledFocusRequest.current && summaryRef.current) {
      handledFocusRequest.current = focusRequest;
      summaryRef.current.focus();
    }
  });
  const focusSummary = () => setFocusRequest((count) => count + 1);

  async function onValid(values: LeadValues, event?: BaseSyntheticEvent) {
    const form = event?.target as HTMLFormElement | undefined;
    const honeypot = (form?.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setFormError(null);
    if (!token) {
      setFormError(OFFLINE);
      return focusSummary();
    }
    try {
      await postJson("/api/public/platform/leads", { ...values, form_token: token, website: honeypot });
      setSent(values);
    } catch (error) {
      const body = error instanceof ApiRequestError ? error.body : null;
      if (body?.code === "validation_error") {
        for (const [name, messages] of Object.entries(body.fields)) {
          if (isField(name)) setError(name, { message: messages[0] });
          else setFormError(messages[0]);
        }
      } else {
        setFormError(body?.message ?? OFFLINE);
      }
      focusSummary();
    }
  }

  if (sent) {
    return (
      <div className="surface rounded-card p-8 text-center" role="status">
        <CircleCheck aria-hidden className="animate-pop mx-auto size-16 text-success" />
        <h3 ref={successRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
          Thank you. We&apos;ve received your request.
        </h3>
        <p className="mt-3 text-ink-muted">
          We&apos;ll call you on {sent.phone} to talk about getting {sent.school_name} online.
        </p>
      </div>
    );
  }

  const fieldErrors = (Object.keys(LABELS) as (keyof LeadValues)[]).filter((name) => errors[name]?.message);
  const showSummary = Boolean(formError) || (submitCount > 0 && fieldErrors.length > 0);
  const text = (name: "school_name" | "town" | "contact_name", autoComplete: string, required = true) => (
    <Field id={`lead-${name}`} label={LABELS[name]} required={required} error={errors[name]?.message}>
      {(props) => <input {...props} {...register(name)} type="text" autoComplete={autoComplete} className={inputClasses} />}
    </Field>
  );

  return (
    <form noValidate onSubmit={handleSubmit(onValid, focusSummary)} className="surface space-y-6 rounded-card p-6 sm:p-8">
      <p className="text-sm text-ink-muted">Fields marked * are required.</p>

      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-control border border-danger bg-danger/10 p-4 outline-none">
          <h3 className="font-semibold">Please check the form</h3>
          {formError && <p className="mt-1">{formError}</p>}
          {fieldErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {fieldErrors.map((name) => (
                <li key={name}>
                  <a className="link" href={`#lead-${name}`}>
                    {LABELS[name]}: {errors[name]?.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {text("school_name", "organization")}
        {text("town", "address-level2")}
        {text("contact_name", "name")}
        <Field id="lead-phone" label={LABELS.phone} required hint="We'll call you on this number." error={errors.phone?.message}>
          {(props) => <input {...props} {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" className={inputClasses} />}
        </Field>
      </div>
      <Field id="lead-email" label={LABELS.email} error={errors.email?.message}>
        {(props) => <input {...props} {...register("email")} type="email" autoComplete="email" className={inputClasses} />}
      </Field>
      <Field id="lead-message" label={LABELS.message} hint="For example how many pupils you have, or what you need most." error={errors.message?.message}>
        {(props) => <textarea {...props} {...register("message")} rows={4} maxLength={1000} className={inputClasses} />}
      </Field>

      {/* Honeypot: hidden from people, filled in by bots (Phase 1 spec §6.4). */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="lead-website">Leave this field empty</label>
        <input id="lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <input
            id="lead-data_consent"
            type="checkbox"
            {...register("data_consent")}
            aria-invalid={errors.data_consent ? true : undefined}
            aria-describedby={errors.data_consent ? "lead-data_consent-error" : undefined}
            className="mt-1 size-6 shrink-0 accent-[var(--btn-primary)]"
          />
          <label htmlFor="lead-data_consent">
            I agree that {platformName} may use these details to reply to me, as described in the{" "}
            <Link href="/privacy" className="link">
              privacy notice
            </Link>
            .<span aria-hidden className="text-danger"> *</span>
          </label>
        </div>
        {errors.data_consent && (
          <p id="lead-data_consent-error" className="mt-2 text-sm font-medium text-danger">
            {errors.data_consent.message}
          </p>
        )}
      </div>

      <Button type="submit" variant="amber" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
