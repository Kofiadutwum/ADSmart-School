"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getJson, postJson } from "@/lib/client-api";
import { todayInAccra } from "@/lib/dates";
import { buildEnquirySchema, EMPTY_ENQUIRY, toPayload, type EnquiryValues } from "@/lib/enquiry-schema";
import { LEVELS } from "@/lib/levels";
import { Field, inputClasses } from "./field";

const LABELS: Record<keyof EnquiryValues, string> = {
  parent_name: "Your name",
  phone: "Mobile number",
  email: "Email",
  child_name: "Child's name",
  child_date_of_birth: "Child's date of birth",
  level_wanted: "Level",
  preferred_visit_date: "Preferred visit date",
  message: "Message",
  data_consent: "Agreement",
};

const isField = (name: string): name is keyof EnquiryValues => name in EMPTY_ENQUIRY;

export function EnquiryForm({ schoolPhone }: { schoolPhone: string }) {
  const today = useMemo(() => todayInAccra(), []);
  const schema = useMemo(() => buildEnquirySchema(today), [today]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty, submitCount },
  } = useForm<EnquiryValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_ENQUIRY,
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: false, // the error summary takes focus instead (spec §8.7)
  });

  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const handledFocusRequest = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const offline = `We couldn't reach the school's website. Please check your connection, or call us on ${schoolPhone}.`;

  const loadToken = useCallback(async () => {
    try {
      const data = await getJson<{ token: string }>("/api/public/enquiries/form-token");
      setToken(data.token);
      return data.token;
    } catch {
      setFormError(offline);
      return null;
    }
  }, [offline]);

  // Fetch a form token once; state is only set when the request settles.
  useEffect(() => {
    let cancelled = false;
    getJson<{ token: string }>("/api/public/enquiries/form-token").then(
      (data) => {
        if (!cancelled) setToken(data.token);
      },
      () => {
        if (!cancelled) setFormError(offline);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [offline]);

  useEffect(() => {
    if (sentTo) successRef.current?.focus();
  }, [sentTo]);

  // Focus the error summary on the first commit where it exists (spec §8.7). The form's
  // error state can land a render after the request, so this runs after every commit.
  useEffect(() => {
    if (focusRequest > handledFocusRequest.current && summaryRef.current) {
      handledFocusRequest.current = focusRequest;
      summaryRef.current.focus();
    }
  });
  const focusSummary = () => setFocusRequest((count) => count + 1);

  // Ask before leaving a half-filled form (spec §10).
  useEffect(() => {
    if (!isDirty || sentTo) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, sentTo]);

  async function onValid(values: EnquiryValues, event?: BaseSyntheticEvent) {
    const form = event?.target as HTMLFormElement | undefined;
    const honeypot = (form?.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    setFormError(null);
    const formToken = token ?? (await loadToken());
    if (!formToken) return focusSummary();
    try {
      await postJson("/api/public/enquiries", toPayload(values, formToken, honeypot));
      setSentTo(values.phone);
    } catch (error) {
      const body = error instanceof ApiRequestError ? error.body : null;
      if (body?.code === "validation_error") {
        for (const [name, messages] of Object.entries(body.fields)) {
          if (isField(name)) setError(name, { message: messages[0] });
          else setFormError(messages[0]);
        }
      } else {
        if (body?.code === "form_expired") await loadToken();
        setFormError(body?.message ? `${body.message} You can also call us on ${schoolPhone}.` : offline);
      }
      focusSummary();
    }
  }

  if (sentTo) {
    return (
      <div className="surface rounded-card p-8 text-center" role="status">
        <CircleCheck aria-hidden className="animate-pop mx-auto size-16 text-success" />
        <h3 ref={successRef} tabIndex={-1} className="mt-4 text-2xl font-semibold outline-none">
          Thank you. We&apos;ve received your enquiry.
        </h3>
        <p className="mt-3 text-ink-muted">
          We&apos;ll call you on {sentTo} to arrange a visit. You can also call us on {schoolPhone}.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            reset(EMPTY_ENQUIRY);
            setSentTo(null);
          }}
        >
          Send another enquiry
        </Button>
      </div>
    );
  }

  const fieldErrors = (Object.keys(LABELS) as (keyof EnquiryValues)[]).filter((name) => errors[name]?.message);
  const showSummary = Boolean(formError) || (submitCount > 0 && fieldErrors.length > 0);

  return (
    <form noValidate onSubmit={handleSubmit(onValid, focusSummary)} className="surface space-y-8 rounded-card p-6 sm:p-8">
      <p className="text-sm text-ink-muted">Fields marked * are required.</p>

      {showSummary && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-control border border-danger bg-danger/10 p-4 outline-none"
        >
          <h3 className="font-semibold">Please check the form</h3>
          {formError && <p className="mt-1">{formError}</p>}
          {fieldErrors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {fieldErrors.map((name) => (
                <li key={name}>
                  <a className="link" href={`#enquiry-${name}`}>
                    {LABELS[name]}: {errors[name]?.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">About you</legend>
        <Field id="enquiry-parent_name" label={LABELS.parent_name} required error={errors.parent_name?.message}>
          {(props) => <input {...props} {...register("parent_name")} type="text" autoComplete="name" className={inputClasses} />}
        </Field>
        <Field id="enquiry-phone" label={LABELS.phone} required hint="We'll call you on this number." error={errors.phone?.message}>
          {(props) => (
            <input {...props} {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" className={inputClasses} />
          )}
        </Field>
        <Field id="enquiry-email" label={LABELS.email} error={errors.email?.message}>
          {(props) => <input {...props} {...register("email")} type="email" autoComplete="email" className={inputClasses} />}
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">About your child</legend>
        <Field id="enquiry-child_name" label={LABELS.child_name} required error={errors.child_name?.message}>
          {(props) => <input {...props} {...register("child_name")} type="text" autoComplete="off" className={inputClasses} />}
        </Field>
        <Field id="enquiry-child_date_of_birth" label={LABELS.child_date_of_birth} required error={errors.child_date_of_birth?.message}>
          {(props) => <input {...props} {...register("child_date_of_birth")} type="date" max={today} className={inputClasses} />}
        </Field>
        <Field id="enquiry-level_wanted" label={LABELS.level_wanted} required error={errors.level_wanted?.message}>
          {(props) => (
            <select {...props} {...register("level_wanted")} className={inputClasses}>
              <option value="">Choose a level</option>
              {LEVELS.map((level) => (
                <option key={level.code} value={level.code}>
                  {level.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">Your visit</legend>
        <Field
          id="enquiry-preferred_visit_date"
          label={LABELS.preferred_visit_date}
          hint="We'll confirm a time by phone."
          error={errors.preferred_visit_date?.message}
        >
          {(props) => <input {...props} {...register("preferred_visit_date")} type="date" min={today} className={inputClasses} />}
        </Field>
        <Field id="enquiry-message" label={LABELS.message} error={errors.message?.message}>
          {(props) => <textarea {...props} {...register("message")} rows={4} maxLength={1000} className={inputClasses} />}
        </Field>
      </fieldset>

      {/* Honeypot: hidden from people, filled in by bots (spec §6.4). */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="enquiry-website">Leave this field empty</label>
        <input id="enquiry-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <input
            id="enquiry-data_consent"
            type="checkbox"
            {...register("data_consent")}
            aria-invalid={errors.data_consent ? true : undefined}
            aria-describedby={errors.data_consent ? "enquiry-data_consent-error" : undefined}
            className="mt-1 size-6 shrink-0 accent-[var(--btn-primary)]"
          />
          <label htmlFor="enquiry-data_consent">
            I agree that AD Smart School may use these details to reply to my enquiry, as described in the{" "}
            <Link href="/privacy" className="link">
              privacy notice
            </Link>
            .<span aria-hidden className="text-danger"> *</span>
          </label>
        </div>
        {errors.data_consent && (
          <p id="enquiry-data_consent-error" className="mt-2 text-sm font-medium text-danger">
            {errors.data_consent.message}
          </p>
        )}
      </div>

      <Button type="submit" variant="amber" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? "Sending…" : "Send enquiry"}
      </Button>
    </form>
  );
}
