"use client";

import { useState } from "react";
import { InputField, LoadState, useAction, useLoad } from "@/components/portal/kit";
import { RecordsView, type FieldSpec, type Row } from "@/components/portal/records-view";
import { inputClasses } from "@/components/site/field";
import { Button } from "@/components/ui/button";
import { getJson, postJson } from "@/lib/client-api";
import { ghs } from "@/lib/money";
import { ACCOUNTANT, ADMINISTRATOR, BOOKSHOP, FRONT_DESK, HEAD_TEACHER, NURSE, TRANSPORT } from "@/lib/school-roles";
import { ActButton, Panel, Picker, Section, Table, today, useRoleIs, when, words } from "./common";

const SCHOOL = "/api/school";

// ---- Gate (Front Desk) ---------------------------------------------------------------------

export const GATE_TABS = [
  ["/gate", "Pick-up"],
  ["/gate/visitors", "Visitors"],
  ["/gate/late-early", "Late and early"],
  ["/gate/enquiries", "Enquiries"],
] as const;

type Collectors = {
  pupil: { id: number; name: string };
  people: { id: number; name: string; relationship: string; phone: string; has_photo: boolean }[];
  approvals: { id: number; name: string; phone: string }[];
};

export function GateScreen() {
  const [pupil, setPupil] = useState("");
  return (
    <Section title="Pick-up" intro="A child goes only with someone on their list, or the person a parent approved for today. Anyone else is not released, and the family is told at once." tabs={GATE_TABS}>
      <div className="mb-6 max-w-md">
        <Picker id="gate-pupil" label="Pupil" source="pupils" value={pupil} onChange={setPupil} />
      </div>
      {pupil && <ReleaseCheck key={pupil} pupil={pupil} />}
      <TodayReleases />
    </Section>
  );
}

function ReleaseCheck({ pupil }: { pupil: string }) {
  const { data, error } = useLoad<Collectors>(`${SCHOOL}/care/pupils/${pupil}/collectors`);
  const [other, setOther] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const { act, busy, alert } = useAction();
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  const release = (body: Record<string, unknown>) =>
    act(async () => {
      const answer = await postJson<{ status: string }>(`${SCHOOL}/care/releases`, { student: Number(pupil), ...body });
      setResult(
        answer.status === "RELEASED"
          ? `${data.pupil.name} released. The family has been told.`
          : `Not released: this person isn't allowed to collect ${data.pupil.name}. The family has been alerted.`,
      );
    });
  return (
    <Panel title={`Who may collect ${data.pupil.name} today`}>
      {data.people.length === 0 && data.approvals.length === 0 && <p>Nobody is on the list for today.</p>}
      <ul className="space-y-2">
        {data.people.map((person) => (
          <li key={`p${person.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3">
            <span>
              <strong>{person.name}</strong> · {person.relationship} · {person.phone}
              {person.has_photo && (
                // eslint-disable-next-line @next/next/no-img-element -- served privately by the API
                <img src={`${SCHOOL}/pickups/${person.id}/photo`} alt={`Photo of ${person.name}`} className="mt-2 size-24 rounded-control object-cover" />
              )}
            </span>
            <Button disabled={busy} onClick={() => void release({ pickup_person: person.id, collector_name: person.name })}>
              Release to {person.name.split(" ")[0]}
            </Button>
          </li>
        ))}
        {data.approvals.map((approval) => (
          <li key={`a${approval.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3">
            <span>
              <strong>{approval.name}</strong> · approved by the parent for today {approval.phone && `· ${approval.phone}`}
            </span>
            <Button disabled={busy} onClick={() => void release({ approval: approval.id, collector_name: approval.name })}>
              Release to {approval.name.split(" ")[0]}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <InputField id="gate-other" label="Someone else is here to collect" value={other} onChange={setOther} />
        <Button variant="outline" disabled={busy || !other.trim()} onClick={() => void release({ collector_name: other.trim() })}>
          Record and alert the family
        </Button>
      </div>
      {alert}
      {result && (
        <p role="status" className="font-semibold">
          {result}
        </p>
      )}
    </Panel>
  );
}

function TodayReleases() {
  const { data } = useLoad<{ id: number; student: string; collector: string; status: string; at: string }[]>(
    `${SCHOOL}/care/releases?date=${today()}`,
  );
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Today</h2>
      <Table caption="Today's pick-ups" head={["Time", "Pupil", "Collected by", ""]} rows={data.map((row) => [when(row.at), row.student, row.collector, words(row.status)])} />
    </div>
  );
}

export function VisitorsScreen() {
  const desk = useRoleIs(FRONT_DESK);
  return (
    <Section title="Visitors" intro="Everyone who comes in, and when they leave." tabs={GATE_TABS}>
      <RecordsView
        path={`${SCHOOL}/care/visitors`}
        noun="visitor"
        fields={[
          { name: "name", label: "Name", required: true },
          { name: "phone", label: "Phone" },
          { name: "purpose", label: "Here to", required: true },
          { name: "host", label: "Seeing" },
          { name: "time_in", label: "Came in", readOnly: true },
          { name: "time_out", label: "Left", readOnly: true },
        ]}
        canAdd={desk}
        actions={(row, replace) =>
          desk && !row.time_out ? (
            <ActButton
              label="Signed out"
              method="patch"
              path={`${SCHOOL}/care/visitors/${row.id}`}
              body={{ time_out: new Date().toISOString() }}
              onDone={(r) => replace(r as Row)}
            />
          ) : null
        }
      />
    </Section>
  );
}

export function LateEarlyScreen() {
  const desk = useRoleIs(FRONT_DESK);
  return (
    <Section title="Late and early" intro="Pupils arriving late or leaving early, with the reason." tabs={GATE_TABS}>
      <RecordsView
        path={`${SCHOOL}/care/gate`}
        noun="record"
        fields={[
          { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
          { name: "kind", label: "What", type: "choice", required: true, choices: [["LATE_ARRIVAL", "Late arrival"], ["EARLY_DEPARTURE", "Early departure"]] },
          { name: "reason", label: "Reason" },
          { name: "at", label: "When", readOnly: true },
        ]}
        canAdd={desk}
      />
    </Section>
  );
}

export function EnquiriesScreen() {
  const canEdit = useRoleIs(FRONT_DESK, ADMINISTRATOR);
  return (
    <Section title="Enquiries" intro="Families who asked about admission on the website." tabs={GATE_TABS}>
      <RecordsView
        path={`${SCHOOL}/website/enquiries`}
        noun="enquiry"
        title={(row) => `${String(row.parent_name)} · ${String(row.child_name)}`}
        fields={[
          { name: "status", label: "Status", type: "choice", required: true, choices: [["new", "New"], ["contacted", "Contacted"], ["visited", "Visited"], ["enrolled", "Enrolled"], ["closed", "Closed"]] },
          { name: "phone", label: "Phone", readOnly: true },
          { name: "email", label: "Email", readOnly: true },
          { name: "level_wanted", label: "Level wanted", readOnly: true },
          { name: "preferred_visit_date", label: "Visit date", type: "date", readOnly: true },
          { name: "message", label: "Message", readOnly: true },
          { name: "staff_notes", label: "Notes", type: "textarea" },
        ]}
        canEdit={canEdit}
        emptyText="No enquiries yet."
      />
    </Section>
  );
}

// ---- Health (School Nurse) -----------------------------------------------------------------

export const HEALTH_TABS = [
  ["/health", "Sickbay"],
  ["/health/medical", "Medical records"],
  ["/health/incidents", "Incidents"],
  ["/health/special-needs", "Special needs"],
] as const;

const RESTRICTED = "Restricted: every time these records are opened, it is logged.";

export function SickbayScreen() {
  const nurse = useRoleIs(NURSE);
  return (
    <Section title="Sickbay" intro={RESTRICTED} tabs={HEALTH_TABS}>
      <RecordsView
        path={`${SCHOOL}/care/sickbay`}
        noun="sickbay visit"
        fields={[
          { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
          { name: "complaint", label: "Complaint", required: true },
          { name: "action", label: "What was done" },
          { name: "parent_informed", label: "Parent told", type: "boolean" },
          { name: "time_in", label: "Came in", readOnly: true },
        ]}
        canAdd={nurse}
        canEdit={nurse}
      />
    </Section>
  );
}

export function MedicalScreen() {
  const canEdit = useRoleIs(NURSE, ADMINISTRATOR);
  return (
    <Section title="Medical records" intro={RESTRICTED} tabs={HEALTH_TABS}>
      <RecordsView
        path={`${SCHOOL}/care/medical`}
        noun="medical record"
        fields={[
          { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
          { name: "allergies", label: "Allergies" },
          { name: "conditions", label: "Conditions" },
          { name: "medication", label: "Medication" },
          { name: "clinic", label: "Clinic or doctor" },
          { name: "clinic_phone", label: "Clinic phone" },
          { name: "notes", label: "Notes", type: "textarea" },
        ]}
        canAdd={canEdit}
        canEdit={canEdit}
      />
    </Section>
  );
}

const INCIDENT_FIELDS: FieldSpec[] = [
  { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
  { name: "date", label: "Date", type: "date", required: true },
  { name: "kind", label: "Kind", type: "choice", required: true, choices: [["INCIDENT", "Incident or injury"], ["DISCIPLINE", "Discipline"], ["SAFEGUARDING", "Safeguarding concern"]] },
  { name: "description", label: "What happened", type: "textarea", required: true },
  { name: "action_taken", label: "What was done" },
  { name: "parent_informed", label: "Parent told", type: "boolean" },
];

export function IncidentsScreen() {
  const canTell = useRoleIs(NURSE, ADMINISTRATOR, HEAD_TEACHER);
  return (
    <Section title="Incidents" intro={RESTRICTED} tabs={HEALTH_TABS}>
      <RecordsView
        path={`${SCHOOL}/care/incidents`}
        noun="incident"
        fields={INCIDENT_FIELDS}
        canAdd
        canEdit={canTell}
        actions={(row) => (canTell && !row.parent_informed ? <TellFamily id={row.id} /> : null)}
      />
    </Section>
  );
}

function TellFamily({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Text the family
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-end gap-2">
      <InputField id={`tell-${id}`} label="What to tell them" value={detail} onChange={setDetail} required />
      <ActButton label="Send" path={`${SCHOOL}/care/incidents/${id}/notify`} body={{ detail }} onDone={() => setOpen(false)} />
    </span>
  );
}

export function SpecialNeedsScreen() {
  const canEdit = useRoleIs(NURSE, ADMINISTRATOR, HEAD_TEACHER);
  return (
    <Section title="Special needs" intro={RESTRICTED} tabs={HEALTH_TABS}>
      <RecordsView
        path={`${SCHOOL}/care/special-needs`}
        noun="record"
        fields={[
          { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
          { name: "need", label: "Need", required: true },
          { name: "support_plan", label: "Support plan", type: "textarea" },
        ]}
        canAdd={canEdit}
        canEdit={canEdit}
      />
    </Section>
  );
}

// ---- Transport -----------------------------------------------------------------------------

export const TRANSPORT_TABS = [
  ["/transport", "Boarding"],
  ["/transport/routes", "Routes and stops"],
  ["/transport/riders", "Riders"],
  ["/transport/buses", "Buses and crew"],
] as const;

type Riders = { route: string; riders: { student: number; name: string; stop: string; pickup_time: string | null }[] };

export function BoardingScreen() {
  const [route, setRoute] = useState("");
  return (
    <Section title="Boarding" intro="Tick each child on and off the bus; the family gets a text each time." tabs={TRANSPORT_TABS}>
      <div className="mb-6 max-w-md">
        <Picker id="boarding-route" label="Route" source="routes" value={route} onChange={setRoute} />
      </div>
      {route && <RiderList key={route} route={route} />}
    </Section>
  );
}

function RiderList({ route }: { route: string }) {
  const { data, error } = useLoad<Riders>(`${SCHOOL}/transport/routes/${route}/riders`);
  const officer = useRoleIs(TRANSPORT);
  const [done, setDone] = useState<Record<number, string>>({});
  if (!data) return <LoadState error={error} loading={!error} empty={false} emptyText="" />;
  return (
    <ul className="space-y-2">
      {data.riders.length === 0 && <li className="text-ink-muted">Nobody rides this route.</li>}
      {data.riders.map((rider) => (
        <li key={rider.student} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card p-4">
          <span>
            <strong>{rider.name}</strong> · {rider.stop}
            {done[rider.student] && <span className="ml-2 text-sm text-success">{done[rider.student]}</span>}
          </span>
          {officer && (
            <span className="flex gap-2">
              <ActButton
                label="Boarded"
                path={`${SCHOOL}/transport/boarding`}
                body={{ student: rider.student, kind: "BOARDED" }}
                onDone={() => setDone({ ...done, [rider.student]: "Boarded" })}
              />
              <ActButton
                label="Dropped off"
                path={`${SCHOOL}/transport/boarding`}
                body={{ student: rider.student, kind: "DROPPED_OFF" }}
                onDone={() => setDone({ ...done, [rider.student]: "Dropped off" })}
              />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function useTransportEditor() {
  return useRoleIs(TRANSPORT, ADMINISTRATOR);
}

export function RoutesScreen() {
  const canEdit = useTransportEditor();
  return (
    <Section title="Routes and stops" tabs={TRANSPORT_TABS}>
      <div className="space-y-10">
        <RecordsView
          path={`${SCHOOL}/transport/routes`}
          noun="route"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "bus", label: "Bus", type: "option", options: "buses" },
            { name: "daily_fee", label: "Daily fee", type: "money", hint: "Added to the daily list" },
          ]}
          canAdd={canEdit}
          canEdit={canEdit}
          canDelete={canEdit}
        />
        <Panel title="Stops">
          <RecordsView
            path={`${SCHOOL}/transport/stops`}
            noun="stop"
            fields={[
              { name: "route", label: "Route", type: "option", options: "routes", required: true },
              { name: "name", label: "Stop", required: true },
              { name: "order", label: "Order", type: "number" },
              { name: "pickup_time", label: "Pick-up time", type: "time" },
            ]}
            canAdd={canEdit}
            canEdit={canEdit}
            canDelete={canEdit}
          />
        </Panel>
      </div>
    </Section>
  );
}

export function RidersScreen() {
  const canEdit = useTransportEditor();
  return (
    <Section title="Riders" intro="Who rides which route. A change of stop asked by the school waits for the parent to confirm it." tabs={TRANSPORT_TABS}>
      <div className="space-y-10">
        <RecordsView
          path={`${SCHOOL}/transport/riders`}
          noun="rider"
          fields={[
            { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
            { name: "route", label: "Route", type: "option", options: "routes", required: true },
            { name: "stop", label: "Stop", type: "option", options: "stops", required: true },
            { name: "active", label: "Riding", type: "boolean" },
          ]}
          canAdd={canEdit}
          canEdit={canEdit}
        />
        <Panel title="Stop changes waiting for parents">
          <RecordsView
            path={`${SCHOOL}/transport/stop-changes`}
            noun="stop change"
            fields={[
              { name: "student", label: "Pupil", type: "option", options: "pupils", required: true },
              { name: "new_stop", label: "New stop", type: "option", options: "stops", required: true },
              { name: "status", label: "Status", readOnly: true, type: "choice", choices: [["WAITING", "Waiting for the parent"], ["CONFIRMED", "Confirmed"], ["DECLINED", "Declined"]] },
            ]}
            canAdd={canEdit}
          />
        </Panel>
      </div>
    </Section>
  );
}

export function BusesScreen() {
  const canEdit = useTransportEditor();
  return (
    <Section title="Buses and crew" tabs={TRANSPORT_TABS}>
      <div className="space-y-10">
        <RecordsView
          path={`${SCHOOL}/transport/buses`}
          noun="bus"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "plate", label: "Number plate", required: true },
            { name: "capacity", label: "Seats", type: "number" },
            { name: "insurance_expiry", label: "Insurance ends", type: "date" },
            { name: "driver", label: "Driver", type: "option", options: "crew" },
            { name: "attendant", label: "Attendant", type: "option", options: "crew" },
          ]}
          canAdd={canEdit}
          canEdit={canEdit}
          canDelete={canEdit}
        />
        <Panel title="Crew">
          <RecordsView
            path={`${SCHOOL}/transport/crew`}
            noun="crew member"
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "phone", label: "Phone", required: true },
              { name: "role", label: "Role", type: "choice", required: true, choices: [["DRIVER", "Driver"], ["ATTENDANT", "Bus attendant"]] },
              { name: "licence_number", label: "Licence number" },
              { name: "licence_expiry", label: "Licence ends", type: "date" },
            ]}
            canAdd={canEdit}
            canEdit={canEdit}
            canDelete={canEdit}
          />
        </Panel>
      </div>
    </Section>
  );
}

// ---- Shop (Bookshop Keeper) ------------------------------------------------------------------

export const SHOP_TABS = [
  ["/shop", "Collect"],
  ["/shop/orders", "Orders"],
  ["/shop/books", "Books"],
  ["/shop/uniforms", "Uniforms"],
  ["/shop/stock", "Stock"],
] as const;

type Order = {
  id: number;
  student_name: string;
  kind: string;
  status: string;
  total: number;
  collection_code: string;
  created_at: string;
  lines: { id: number; item: string; size: string; quantity: number; price: number; issued: number }[];
};

export function CollectScreen() {
  const keeper = useRoleIs(BOOKSHOP);
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const { act, busy, alert } = useAction();
  return (
    <Section title="Collect an order" intro="The family shows their collection code; everything in stock is handed over." tabs={SHOP_TABS}>
      <div className="flex max-w-md flex-wrap items-end gap-3">
        <InputField id="collect-code" label="Collection code" value={code} onChange={(v) => setCode(v.toUpperCase())} />
        <Button disabled={busy || code.length < 4} onClick={() => void act(async () => setOrder(await getJson<Order>(`${SCHOOL}/shop/collect?code=${code.trim()}`)))}>
          Find
        </Button>
      </div>
      {alert}
      {order && (
        <div className="mt-6">
          <OrderCard order={order} />
          {keeper && ["READY", "PART_ISSUED", "AWAITING_STOCK"].includes(order.status) && (
            <div className="mt-4">
              <ActButton label="Hand over" variant="primary" path={`${SCHOOL}/shop/collect`} body={{ code: order.collection_code }} onDone={(r) => setOrder(r as Order)} />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <article className="rounded-card border border-line bg-card p-5">
      <h3 className="font-semibold">
        {order.student_name} · {words(order.kind)} · code {order.collection_code}
      </h3>
      <p className="text-sm text-ink-muted">
        {words(order.status)} · {ghs(order.total)} · {when(order.created_at)}
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {order.lines.map((line) => (
          <li key={line.id}>
            {line.quantity} × {line.item}
            {line.size && ` (${line.size})`} — {ghs(line.price)} each, {line.issued} handed over
          </li>
        ))}
      </ul>
    </article>
  );
}

export function OrdersScreen() {
  const canTake = useRoleIs(BOOKSHOP, ACCOUNTANT);
  const [status, setStatus] = useState("");
  const { data, setData, error } = useLoad<Order[]>(`${SCHOOL}/shop/orders${status ? `?status=${status}` : ""}`);
  const rows = data ?? [];
  const replace = (row: Order) => setData(rows.map((each) => (each.id === row.id ? row : each)));
  return (
    <Section title="Orders" intro="Orders are paid before they are collected." tabs={SHOP_TABS}>
      <label className="mb-6 block max-w-xs text-sm font-medium">
        Show
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
          <option value="">All orders</option>
          <option value="AWAITING_PAYMENT">Waiting for payment</option>
          <option value="AWAITING_STOCK">Paid, waiting for stock</option>
          <option value="READY">Ready to collect</option>
          <option value="ISSUED">Collected</option>
        </select>
      </label>
      <LoadState error={error} loading={!data && !error} empty={rows.length === 0} emptyText="No orders." />
      <ul className="space-y-4">
        {rows.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} />
            {canTake && order.status === "AWAITING_PAYMENT" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <ActButton label="Paid in cash" path={`${SCHOOL}/shop/orders/${order.id}/pay`} body={{ method: "CASH" }} onDone={(r) => replace(r as Order)} />
                <ActButton label="Paid from wallet" path={`${SCHOOL}/shop/orders/${order.id}/pay`} body={{ method: "WALLET" }} onDone={(r) => replace(r as Order)} />
                <ActButton label="Cancel order" confirm="Cancel this order?" path={`${SCHOOL}/shop/orders/${order.id}/cancel`} onDone={(r) => replace(r as Order)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function BooksScreen() {
  const keeper = useRoleIs(BOOKSHOP);
  const canRequire = useRoleIs(BOOKSHOP, HEAD_TEACHER);
  return (
    <Section title="Books" intro="The catalogue, with every price change kept, and the books each class needs." tabs={SHOP_TABS}>
      <div className="space-y-10">
        <RecordsView
          path={`${SCHOOL}/shop/books`}
          noun="book"
          fields={[
            { name: "title", label: "Title", required: true },
            { name: "price", label: "Price", type: "money", required: true },
            { name: "subject", label: "Subject", type: "option", options: "subjects" },
            { name: "year_group", label: "Year group" },
            { name: "low_stock_at", label: "Warn when stock falls to", type: "number" },
            { name: "stock", label: "In stock", type: "number", readOnly: true },
            { name: "active", label: "On sale", type: "boolean" },
          ]}
          canAdd={keeper}
          canEdit={keeper}
        />
        <Panel title="Books each class needs">
          <RecordsView
            path={`${SCHOOL}/shop/required-books`}
            noun="required book"
            fields={[
              { name: "school_class", label: "Class", type: "option", options: "classes", required: true },
              { name: "book", label: "Book", type: "option", options: "books", required: true },
            ]}
            canAdd={canRequire}
            canDelete={canRequire}
          />
        </Panel>
      </div>
    </Section>
  );
}

export function UniformsScreen() {
  const keeper = useRoleIs(BOOKSHOP);
  return (
    <Section title="Uniforms" intro="Items, sizes and prices. Stock is counted per size." tabs={SHOP_TABS}>
      <RecordsView
        path={`${SCHOOL}/shop/uniforms`}
        noun="uniform item"
        fields={[
          { name: "name", label: "Item", required: true },
          { name: "sizes", label: "Sizes", type: "list", required: true, hint: "Separated by commas, for example S, M, L" },
          { name: "price", label: "Price", type: "money", required: true },
          { name: "low_stock_at", label: "Warn when a size falls to", type: "number" },
          { name: "active", label: "On sale", type: "boolean" },
        ]}
        canAdd={keeper}
        canEdit={keeper}
        actions={(row) => {
          const stock = row.stock as Record<string, number> | undefined;
          return stock && Object.keys(stock).length ? (
            <span className="text-sm text-ink-muted">
              In stock: {Object.entries(stock).map(([size, count]) => `${size} ${count}`).join(", ")}
            </span>
          ) : null;
        }}
      />
    </Section>
  );
}

type Movement = { id: number; item: string; change: number; reason: string; note: string; by: string; at: string };

export function StockScreen() {
  const keeper = useRoleIs(BOOKSHOP);
  const { data, error, reload } = useLoad<Movement[]>(`${SCHOOL}/shop/stock`);
  const low = useLoad<{ item: string; stock: number; low_at: number }[]>(`${SCHOOL}/shop/low-stock`);
  const [values, setValues] = useState({ book: "", uniform: "", size: "", change: "", reason: "RECEIVED", note: "" });
  const { act, busy, alert } = useAction();
  const set = (key: string) => (value: string) => setValues({ ...values, [key]: value });
  return (
    <Section title="Stock" intro="Every item received, issued or adjusted is recorded." tabs={SHOP_TABS}>
      {low.data && low.data.length > 0 && (
        <Panel title="Running low">
          <ul className="list-inside list-disc">
            {low.data.map((row) => (
              <li key={row.item}>
                {row.item}: {row.stock} left
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {keeper && (
        <div className="my-6">
          <Panel title="Record stock">
            <div className="grid gap-4 sm:grid-cols-3">
              <Picker id="stock-book" label="Book" source="books" value={values.book} onChange={set("book")} includeAll="—" />
              <Picker id="stock-uniform" label="or uniform item" source="uniforms" value={values.uniform} onChange={set("uniform")} includeAll="—" />
              <InputField id="stock-size" label="Size (uniforms)" value={values.size} onChange={set("size")} />
              <InputField id="stock-change" label="How many (negative to remove)" value={values.change} onChange={set("change")} />
              <label className="block text-sm font-medium">
                Why
                <select value={values.reason} onChange={(e) => set("reason")(e.target.value)} className={`${inputClasses} mt-1 min-h-11 py-2`}>
                  <option value="RECEIVED">Received</option>
                  <option value="RETURNED">Returned</option>
                  <option value="ADJUSTED">Count corrected</option>
                </select>
              </label>
              <InputField id="stock-note" label="Note" value={values.note} onChange={set("note")} />
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await postJson(`${SCHOOL}/shop/stock`, {
                    ...(values.book && { book: Number(values.book) }),
                    ...(values.uniform && { uniform: Number(values.uniform) }),
                    size: values.size,
                    change: Number(values.change),
                    reason: values.reason,
                    note: values.note,
                  });
                  setValues({ ...values, change: "", note: "" });
                  reload();
                  low.reload();
                })
              }
            >
              Record
            </Button>
            {alert}
          </Panel>
        </div>
      )}
      <LoadState error={error} loading={!data && !error} empty={(data ?? []).length === 0} emptyText="No stock recorded yet." />
      {data && data.length > 0 && (
        <Table caption="Stock movements" head={["When", "Item", "Change", "Why", "By"]} rows={data.map((m) => [when(m.at), m.item, m.change, words(m.reason), m.by])} />
      )}
    </Section>
  );
}

