import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, ClipboardList, KeyRound, Lock, Plus, QrCode, ScanLine, Search, ShieldAlert, Undo2, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FeedLine } from "../components/events";
import { StockGauge } from "../components/StockGauge";
import {
  Avatar, Button, Card, Label, Mono, PageHeader, PartMedallion, Segmented, StatusPill, VedBadge, cx, useMotionOff,
} from "../components/ui";
import { MANAGER_PIN, OVERRIDE_WINDOW_MIN } from "../config";
import { BINS, zoneOf } from "../data/bins";
import { PARTS, partById, type Part } from "../data/parts";
import { MANAGER, MODELS, TECHNICIANS } from "../data/people";
import { countdown, duration, time } from "../lib/format";
import type { Chain, JobCard, LedgerEvent } from "../lib/ledger";
import { stockStatus } from "../lib/policy";
import { queryParam, useClock, useStore } from "../state/store";

type Stage = "jc" | "part" | "tech" | "blocked" | "create" | "override" | "countdown" | "done";
type Flow = {
  stage: Stage;
  jc?: string;
  part?: string;
  tech?: string;
  qty: number;
  block?: "no-jc" | "not-on-jc";
  overrideId?: string;
  done?: LedgerEvent;
};

const START: Flow = { stage: "jc", qty: 1 };
const REASONS = ["Customer waiting — car on lift", "Breakdown — car towed in", "Job card system down", "Advisor away — job card to follow"];

function initialFlow(): Flow {
  const demo = queryParam("demo");
  const pads = PARTS.find((p) => p.short === "Front Brake Pads")!;
  if (demo === "blocked") return { stage: "blocked", part: pads.id, qty: 1, block: "no-jc" };
  if (demo === "override") return { stage: "override", part: pads.id, qty: 1, block: "no-jc" };
  if (demo === "emergency") return { stage: "countdown", qty: 1, overrideId: "__seeded" };
  if (demo === "tech") return { stage: "tech", jc: "JC-24817", part: pads.id, qty: 1 };
  return START;
}

export function Counter() {
  const store = useStore();
  const { jobCards, stock, events, chains, user } = store;
  const [mode, setMode] = useState<"issue" | "return">("issue");
  const [flow, setFlow] = useState<Flow>(initialFlow);
  const [freshId, setFreshId] = useState<string>();

  const openJCs = useMemo(() => jobCards.filter((j) => !j.invoicedAt).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)), [jobCards]);
  const jc = flow.jc ? store.jobCard(flow.jc) : undefined;
  const part = flow.part ? partById(flow.part) : undefined;

  // The seeded pending emergency issue (for ?demo=emergency).
  const pendingChains = chains.filter((c) => c.status === "pending-link").sort((a, b) => (a.issue.ts < b.issue.ts ? 1 : -1));
  useEffect(() => {
    if (flow.overrideId === "__seeded" && pendingChains[0]) setFlow((f) => ({ ...f, overrideId: pendingChains[0].issue.id, part: pendingChains[0].issue.partId }));
  }, [flow.overrideId, pendingChains]);

  const today = new Date(store.now);
  today.setHours(0, 0, 0, 0);
  const feed = events.filter((e) => new Date(e.ts).getTime() >= today.getTime() && e.type !== "BILLED").slice(-10).reverse();

  const canIssue = user.role !== "Technician";

  const choosePart = (p: Part) => {
    if (!jc) return setFlow((f) => ({ ...f, part: p.id, stage: "blocked", block: "no-jc" }));
    const line = jc.lines.find((l) => l.partId === p.id);
    if (!line) return setFlow((f) => ({ ...f, part: p.id, stage: "blocked", block: "not-on-jc" }));
    setFlow((f) => ({ ...f, part: p.id, qty: line.qty, stage: "tech", tech: jc.technicians.length === 1 ? jc.technicians[0] : undefined }));
  };

  const doIssue = () => {
    if (!jc || !part || !flow.tech) return;
    const e = store.issue({ jobCardId: jc.id, partId: part.id, qty: flow.qty, technician: flow.tech });
    setFreshId(e.id);
    setFlow((f) => ({ ...f, stage: "done", done: e }));
  };

  const step = flow.stage === "jc" ? 0 : flow.stage === "part" || flow.stage === "blocked" || flow.stage === "create" ? 1 : flow.stage === "tech" ? 2 : 3;

  return (
    <div>
      <PageHeader
        eyebrow="Issue Counter · Store window 1"
        title="Every part leaves against a job card."
        sub="Scan the job card, then the bin, then the technician. Anything else locks the counter."
        right={
          <Segmented
            value={mode}
            onChange={(m) => { setMode(m); setFlow(START); }}
            options={[
              { value: "issue", label: <span className="inline-flex items-center gap-1.5"><ScanLine size={14} /> Issue</span> },
              { value: "return", label: <span className="inline-flex items-center gap-1.5"><Undo2 size={14} /> Return</span> },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 min-[1300px]:grid-cols-[1fr_420px]">
        <div className="min-w-0">
          {!canIssue && (
            <div className="mb-4 rounded-2xl border border-amber/30 bg-amber-soft px-5 py-3 text-[14px] text-[#8a5e0b]">
              Signed in as a technician. Parts are issued by the store — switch to a storekeeper to use the counter.
            </div>
          )}
          {mode === "issue" ? (
            <>
              <Stepper step={step} jc={jc} part={part} tech={flow.tech} blocked={flow.stage === "blocked"} onStep={(i) => {
                if (i === 0) setFlow((f) => ({ ...START, jc: f.jc }));
                if (i === 1) setFlow((f) => ({ ...f, stage: "part", block: undefined }));
              }} />
              <FlowPanel
                flow={flow}
                setFlow={setFlow}
                jc={jc}
                part={part}
                openJCs={openJCs}
                stock={stock}
                canIssue={canIssue}
                onPart={choosePart}
                onIssue={doIssue}
                onFresh={setFreshId}
              />
            </>
          ) : (
            <ReturnPanel onFresh={setFreshId} />
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <PendingLinks chains={pendingChains} openJCs={openJCs} />
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <Label>Today at the counter</Label>
              <span className="flex items-center gap-1.5 text-[11.5px] text-petrol"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-petrol" /> Live</span>
            </div>
            <div className="-mx-2">
              <AnimatePresence initial={false}>
                {feed.map((e) => (
                  <motion.div key={e.id} layout initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                    <FeedLine e={e} fresh={e.id === freshId} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stepper({ step, jc, part, tech, blocked, onStep }: { step: number; jc?: JobCard; part?: Part; tech?: string; blocked: boolean; onStep: (i: number) => void }) {
  const items = [
    { n: "1", title: "Job card", value: jc ? `${jc.id} · ${jc.model}` : blocked ? "Missing" : "Scan or choose", filled: !!jc, warn: blocked && !jc },
    { n: "2", title: "Part", value: part ? `${part.short} · ${BINS[part.id]}` : "Scan the bin", filled: !!part && step > 1, warn: false },
    { n: "3", title: "Technician", value: tech ?? "Assigned on the job card", filled: !!tech && step > 2, warn: false },
  ];
  return (
    <div className="mb-5 grid grid-cols-3 gap-3">
      {items.map((it, i) => {
        const done = it.filled;
        const active = i === step;
        return (
          <button
            key={it.n}
            onClick={() => onStep(i)}
            className={cx(
              "flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition",
              it.warn ? "border-oxblood/40 bg-white" : active ? "border-ink/80 bg-white shadow-card" : done ? "border-petrol/25 bg-white/70" : "border-hair bg-white/50",
            )}
          >
            <span className={cx(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full font-serif text-[22px]",
              it.warn ? "border border-oxblood/40 bg-oxblood-soft text-oxblood" : done ? "bg-petrol text-white" : active ? "bg-ink text-white" : "border border-hair text-muted",
            )}>
              {it.warn ? "!" : done ? <Check size={18} strokeWidth={2.2} /> : it.n}
            </span>
            <span className="min-w-0">
              <span className="block text-[11.5px] font-medium uppercase tracking-label text-muted">{it.title}</span>
              <span className={cx("block truncate text-[15px]", it.warn ? "text-oxblood" : done || active ? "text-ink" : "text-muted")}>{it.value}</span>
            </span>
            {i < 2 && <ChevronRight size={16} className="ml-auto shrink-0 text-hair" />}
          </button>
        );
      })}
    </div>
  );
}

function FlowPanel(props: {
  flow: Flow; setFlow: React.Dispatch<React.SetStateAction<Flow>>; jc?: JobCard; part?: Part; openJCs: JobCard[];
  stock: Record<string, number>; canIssue: boolean; onPart: (p: Part) => void; onIssue: () => void; onFresh: (id: string) => void;
}) {
  const { flow, setFlow, jc, part } = props;
  const off = useMotionOff();
  const blocked = flow.stage === "blocked";
  return (
    <motion.div
      key={blocked ? `blocked-${flow.part}` : "panel"}
      animate={blocked && !off ? { x: [0, -12, 11, -7, 6, -2, 0] } : { x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card
        className={cx("relative overflow-hidden transition-shadow duration-500", blocked && "!border-oxblood/40")}
        style={blocked ? { boxShadow: "0 0 0 4px rgba(163,48,42,.08), 0 0 60px rgba(163,48,42,.18), 0 8px 24px rgba(0,0,0,.06)" } : undefined}
      >
        <div className="grid min-h-[560px] grid-cols-[340px_1fr]">
          <Ticket jc={jc} part={part} tech={flow.tech} qty={flow.qty} stock={props.stock} blocked={blocked} />
          <div className="min-w-0 border-l border-hair p-7">
            <AnimatePresence mode="wait">
              <motion.div key={flow.stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                {flow.stage === "jc" && <JobCardStep openJCs={props.openJCs} onPick={(id) => setFlow((f) => ({ ...f, jc: id, stage: "part" }))} onSkip={() => setFlow((f) => ({ ...f, stage: "part" }))} />}
                {flow.stage === "part" && <PartStep jc={jc} stock={props.stock} onPick={props.onPart} />}
                {flow.stage === "blocked" && part && (
                  <Blocked
                    part={part}
                    jc={jc}
                    reason={flow.block ?? "no-jc"}
                    onCreate={() => setFlow((f) => ({ ...f, stage: "create" }))}
                    onEmergency={() => setFlow((f) => ({ ...f, stage: "override" }))}
                    onBack={() => setFlow((f) => ({ ...f, stage: "part", part: undefined }))}
                  />
                )}
                {flow.stage === "create" && part && <CreateJobCard part={part} onDone={(id, tech) => setFlow((f) => ({ ...f, jc: id, tech, stage: "tech" }))} onCancel={() => setFlow((f) => ({ ...f, stage: "blocked" }))} />}
                {flow.stage === "tech" && jc && part && (
                  <TechStep jc={jc} part={part} flow={flow} setFlow={setFlow} onHand={props.stock[part.id]} canIssue={props.canIssue} onIssue={props.onIssue} />
                )}
                {flow.stage === "override" && part && (
                  <Override part={part} onHand={props.stock[part.id]} onApproved={(id) => { props.onFresh(id); setFlow((f) => ({ ...f, stage: "countdown", overrideId: id })); }} onCancel={() => setFlow((f) => ({ ...f, stage: "blocked" }))} />
                )}
                {flow.stage === "countdown" && flow.overrideId && <Countdown issueId={flow.overrideId} onNext={() => setFlow(START)} />}
                {flow.stage === "done" && flow.done && (
                  <Done e={flow.done} onNext={() => setFlow(START)} onSameJC={() => setFlow((f) => ({ ...START, jc: f.jc, stage: "part" }))} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function Ticket({ jc, part, tech, qty, stock, blocked }: { jc?: JobCard; part?: Part; tech?: string; qty: number; stock: Record<string, number>; blocked: boolean }) {
  const { policy } = useStore();
  return (
    <div className="flex flex-col bg-[linear-gradient(180deg,#FBFAF7,#F3F1EC)] p-7">
      <Label>Issue slip</Label>
      <div className="mt-4 space-y-4">
        <Slot label="Job card" filled={!!jc} warn={blocked && !jc}>
          {jc ? (
            <>
              <Mono className="text-[15px]">{jc.id}</Mono>
              <div className="mt-0.5 text-[14px] text-ink">{jc.model} <span className="text-muted">· {jc.reg}</span></div>
              <div className="text-[12.5px] text-muted">Advisor {jc.advisor}</div>
            </>
          ) : <span className={blocked ? "text-oxblood" : "text-muted"}>{blocked ? "None — not allowed" : "Waiting for scan"}</span>}
        </Slot>
        <Slot label="Part" filled={!!part}>
          {part ? (
            <div className="flex items-start gap-3">
              <PartMedallion part={part} size={52} />
              <div className="min-w-0">
                <div className="text-[15px] font-medium leading-tight text-ink">{part.short}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <VedBadge ved={part.ved} />
                  <Mono className="text-muted">{BINS[part.id]}</Mono>
                </div>
              </div>
            </div>
          ) : <span className="text-muted">Scan the bin label</span>}
          {part && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between text-[12px] text-muted">
                <span>On hand <span className="font-serif text-[22px] text-ink">{stock[part.id]}</span></span>
                <StatusPill status={stockStatus(stock[part.id], policy(part.id))} short />
              </div>
              <StockGauge onHand={stock[part.id]} policy={policy(part.id)} height={6} />
            </div>
          )}
        </Slot>
        <Slot label="Technician" filled={!!tech}>
          {tech ? <div className="flex items-center gap-2.5"><Avatar name={tech} size={30} /><span className="text-[14px] text-ink">{tech}</span><span className="ml-auto font-serif text-[22px]">{qty}×</span></div> : <span className="text-muted">Must be on the job card</span>}
        </Slot>
      </div>
      <div className="mt-auto pt-6 text-[11.5px] leading-relaxed text-muted">
        Every issue is written to the ledger with time, storekeeper, technician and job card.
      </div>
    </div>
  );
}

function Slot({ label, filled, warn, children }: { label: string; filled: boolean; warn?: boolean; children: ReactNode }) {
  return (
    <div className={cx("rounded-2xl border bg-white px-4 py-3.5 transition-colors", warn ? "border-oxblood/40" : filled ? "border-petrol/25" : "border-dashed border-hair")}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-label text-muted">
        {filled && <Check size={11} className="text-petrol" strokeWidth={2.5} />}
        {label}
      </div>
      <div className="text-[14px]">{children}</div>
    </div>
  );
}

function Scanner({ label }: { label: string }) {
  const off = useMotionOff();
  return (
    <div className="relative grid h-[230px] w-[230px] place-items-center overflow-hidden rounded-3xl border border-hair bg-[#FBFAF7]">
      {["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"].map((c) => (
        <span key={c} className={`absolute h-7 w-7 rounded-[6px] border-ink/70 ${c}`} />
      ))}
      <QrCode size={96} strokeWidth={1} className="-mt-6 text-ink/25" />
      {!off && (
        <motion.div
          className="absolute inset-x-6 h-[2px] rounded-full bg-petrol shadow-[0_0_18px_4px_rgba(14,94,99,.35)]"
          initial={{ top: "14%" }}
          animate={{ top: ["14%", "84%", "14%"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span className="absolute bottom-11 text-[11px] uppercase tracking-label text-muted">{label}</span>
    </div>
  );
}

function JobCardStep({ openJCs, onPick, onSkip }: { openJCs: JobCard[]; onPick: (id: string) => void; onSkip: () => void }) {
  const [q, setQ] = useState("");
  const list = openJCs.filter((j) => `${j.id} ${j.model} ${j.reg} ${j.advisor} ${j.technicians.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid grid-cols-[230px_1fr] gap-7">
      <div>
        <Scanner label="Scan job card" />
        <p className="mt-4 text-[13px] leading-relaxed text-muted">Hold the job card QR under the counter scanner, or pick it from the open list.</p>
        <button onClick={onSkip} className="mt-5 text-left text-[13px] text-muted underline decoration-hair underline-offset-4 hover:text-ink">
          Technician asking without a job card? Scan the part →
        </button>
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <Label>Open job cards · {openJCs.length}</Label>
          <div className="flex items-center gap-2 rounded-full border border-hair bg-white px-3 py-1.5">
            <Search size={14} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job card, reg no., technician" className="w-56 bg-transparent text-[13px] outline-none placeholder:text-muted/70" />
          </div>
        </div>
        <div className="scrollbar-thin max-h-[440px] space-y-1.5 overflow-y-auto pr-1">
          {list.map((j) => (
            <button key={j.id} onClick={() => onPick(j.id)} className="group flex w-full items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 text-left hover:border-hair hover:bg-[#FBFAF7]">
              <Mono className="w-[86px] shrink-0 text-[13px]">{j.id}</Mono>
              <div className="w-[190px] shrink-0">
                <div className="text-[14px] text-ink">{j.model}</div>
                <div className="font-mono text-[11.5px] text-muted">{j.reg}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {j.lines.map((l) => (
                  <span key={l.partId} className="rounded-full bg-subtle px-2 py-[2px] text-[11.5px] text-ink/80">{l.qty > 1 ? `${l.qty}× ` : ""}{partById(l.partId).short}</span>
                ))}
              </div>
              <div className="w-[92px] shrink-0 text-right text-[12px] text-muted">{j.technicians[0]}</div>
              <ChevronRight size={15} className="shrink-0 text-hair group-hover:text-ink" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PartStep({ jc, stock, onPick }: { jc?: JobCard; stock: Record<string, number>; onPick: (p: Part) => void }) {
  const requested = jc ? jc.lines.map((l) => partById(l.partId)) : [];
  const others = PARTS.filter((p) => !requested.includes(p));
  const Tile = ({ p, req }: { p: Part; req?: boolean }) => (
    <button onClick={() => onPick(p)} className={cx("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:shadow-card", req ? "border-petrol/30 bg-petrol-soft/40" : "border-hair bg-white")}>
      <PartMedallion part={p} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] text-ink">{p.short}</div>
        <div className="font-mono text-[11px] text-muted">{BINS[p.id]} · {stock[p.id]} on hand</div>
      </div>
      {req && <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-petrol">On card</span>}
    </button>
  );
  return (
    <div className="grid grid-cols-[230px_1fr] gap-7">
      <div>
        <Scanner label="Scan bin label" />
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          {jc ? <>Parts requested on <Mono>{jc.id}</Mono> are highlighted.</> : "No job card scanned yet."}
        </p>
      </div>
      <div className="min-w-0">
        {jc && (
          <>
            <Label className="mb-2">Requested on {jc.id}</Label>
            <div className="mb-5 grid grid-cols-2 gap-2">{requested.map((p) => <Tile key={p.id} p={p} req />)}</div>
          </>
        )}
        <Label className="mb-2">{jc ? "Other bins" : "Bins"}</Label>
        <div className="scrollbar-thin grid max-h-[380px] grid-cols-2 gap-2 overflow-y-auto pr-1 min-[1700px]:grid-cols-3">
          {others.map((p) => <Tile key={p.id} p={p} />)}
        </div>
      </div>
    </div>
  );
}

function Blocked({ part, jc, reason, onCreate, onEmergency, onBack }: { part: Part; jc?: JobCard; reason: "no-jc" | "not-on-jc"; onCreate: () => void; onEmergency: () => void; onBack: () => void }) {
  return (
    <div className="flex h-full min-h-[500px] flex-col items-center justify-center text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className="grid h-20 w-20 place-items-center rounded-full border border-oxblood/30 bg-oxblood-soft text-oxblood">
        <Lock size={32} strokeWidth={1.6} />
      </motion.div>
      <h2 className="mt-6 font-serif text-[64px] leading-none text-ink">{reason === "no-jc" ? "No job card, no part." : "Not on this job card."}</h2>
      <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-muted">
        {reason === "no-jc" ? (
          <><span className="text-ink">{part.short}</span> ({BINS[part.id]}) can't leave the store until it's tied to a vehicle and a bill. A verbal request isn't enough.</>
        ) : (
          <><Mono>{jc?.id}</Mono> asks for {jc?.lines.map((l) => partById(l.partId).short).join(" and ")}. <span className="text-ink">{part.short}</span> isn't on it.</>
        )}
      </p>
      <div className="mt-8 flex items-center gap-3">
        {reason === "no-jc" ? (
          <Button variant="ink" onClick={onCreate} className="px-5 py-2.5 text-[14px]"><Plus size={16} /> Create job card</Button>
        ) : (
          <Button variant="ink" onClick={onBack} className="px-5 py-2.5 text-[14px]"><ClipboardList size={16} /> Choose a requested part</Button>
        )}
        <Button variant="ghost" onClick={onEmergency} className="border-champagne/50 px-5 py-2.5 text-[14px] text-[#7d6238]"><ShieldAlert size={16} /> Emergency issue (manager approval)</Button>
      </div>
      <div className="mt-6 text-[12.5px] text-muted">Emergency issues must be linked to a job card within {OVERRIDE_WINDOW_MIN / 60} hours, or they show up as leakage.</div>
    </div>
  );
}

function CreateJobCard({ part, onDone, onCancel }: { part: Part; onDone: (id: string, tech: string) => void; onCancel: () => void }) {
  const { createJobCard } = useStore();
  const [model, setModel] = useState<string>("GLC 300");
  const [reg, setReg] = useState("TS 09 FB 2207");
  const [tech, setTech] = useState<string>(TECHNICIANS[1]);
  return (
    <div className="max-w-[640px]">
      <Label>New job card</Label>
      <h3 className="mt-1 font-serif text-[36px] leading-tight">Open a job card for {part.short}</h3>
      <p className="mt-1 text-[14px] text-muted">The part is added as the first line. The advisor completes the rest.</p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Field label="Model">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-transparent outline-none">{MODELS.map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
        <Field label="Reg. no.">
          <input value={reg} onChange={(e) => setReg(e.target.value.toUpperCase())} className="w-full bg-transparent font-mono outline-none" />
        </Field>
      </div>
      <Label className="mb-2 mt-5">Technician</Label>
      <div className="flex flex-wrap gap-2">
        {TECHNICIANS.map((t) => (
          <button key={t} onClick={() => setTech(t)} className={cx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]", t === tech ? "border-petrol bg-petrol-soft text-petrol" : "border-hair bg-white")}>
            <Avatar name={t} size={22} /> {t}
          </button>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <Button onClick={() => { const j = createJobCard({ model, reg, technician: tech, partId: part.id }); onDone(j.id, tech); }}>Create and continue</Button>
        <Button variant="ghost" onClick={onCancel}>Back</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-xl border border-hair bg-white px-3.5 py-2.5">
      <span className="block text-[10.5px] font-medium uppercase tracking-label text-muted">{label}</span>
      <span className="mt-0.5 block text-[14.5px] text-ink">{children}</span>
    </label>
  );
}

function TechStep({ jc, part, flow, setFlow, onHand, canIssue, onIssue }: {
  jc: JobCard; part: Part; flow: Flow; setFlow: React.Dispatch<React.SetStateAction<Flow>>; onHand: number; canIssue: boolean; onIssue: () => void;
}) {
  const short = onHand < flow.qty;
  return (
    <div>
      <Label>Who is taking it?</Label>
      <h3 className="mt-1 font-serif text-[36px] leading-tight">Technician on {jc.id}</h3>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {TECHNICIANS.map((t) => {
          const assigned = jc.technicians.includes(t);
          const sel = flow.tech === t;
          return (
            <button key={t} disabled={!assigned} onClick={() => setFlow((f) => ({ ...f, tech: t }))}
              className={cx("flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition", sel ? "border-petrol bg-petrol-soft/60" : assigned ? "border-hair bg-white hover:shadow-card" : "cursor-not-allowed border-hair bg-subtle/40 opacity-50")}>
              <Avatar name={t} size={36} tone={sel ? "petrol" : "silver"} />
              <span>
                <span className="block text-[14.5px] text-ink">{t}</span>
                <span className="block text-[11.5px] text-muted">{assigned ? "Assigned" : `Not on ${jc.id}`}</span>
              </span>
              {sel && <UserCheck size={18} className="ml-auto text-petrol" />}
            </button>
          );
        })}
      </div>
      <div className="mt-7 flex items-center gap-6">
        <div>
          <Label>Quantity</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => setFlow((f) => ({ ...f, qty: Math.max(1, f.qty - 1) }))} className="h-9 w-9 rounded-full border border-hair bg-white text-[18px]">−</button>
            <span className="w-10 text-center font-serif text-[32px]">{flow.qty}</span>
            <button onClick={() => setFlow((f) => ({ ...f, qty: f.qty + 1 }))} className="h-9 w-9 rounded-full border border-hair bg-white text-[18px]">+</button>
          </div>
        </div>
        <div className="ml-auto text-right">
          {short && <div className="mb-2 text-[13px] text-oxblood">Only {onHand} on the shelf — raise an urgent order from Reorder.</div>}
          <Button onClick={onIssue} disabled={!flow.tech || short || !canIssue} className="px-7 py-3.5 text-[16px]">
            <ScanLine size={18} /> Issue {flow.qty}× {part.short}{flow.tech ? ` to ${flow.tech}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Done({ e, onNext, onSameJC }: { e: LedgerEvent; onNext: () => void; onSameJC: () => void }) {
  const off = useMotionOff();
  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center text-center">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <motion.circle cx="54" cy="54" r="50" fill="#E3EEEE" stroke="#0E5E63" strokeWidth="2" initial={{ pathLength: off ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: "easeOut" }} />
        <motion.path d="M34 56 L48 70 L75 40" fill="none" stroke="#0E5E63" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: off ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: off ? 0 : 0.45, duration: 0.45, ease: "easeOut" }} />
      </svg>
      <h2 className="mt-6 font-serif text-[56px] leading-none">Issued.</h2>
      <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: off ? 0 : 0.7, duration: 0.5 }} className="mt-6 rounded-2xl border border-hair bg-[#FBFAF7] px-5 py-3 text-[15px] text-muted">
        <span className="mr-2 font-mono text-ink">{time(e.ts)}</span>
        <span className="text-ink">{e.actor}</span> issued {e.qty}× <span className="text-ink">{partById(e.partId).short}</span> to <span className="text-ink">{e.technician}</span> against <Mono className="text-ink">{e.jobCardId}</Mono>
      </motion.div>
      <div className="mt-8 flex gap-3">
        <Button variant="ink" onClick={onNext}>Next job card</Button>
        <Button variant="ghost" onClick={onSameJC}>Another part, same job card</Button>
      </div>
    </div>
  );
}

function Override({ part, onHand, onApproved, onCancel }: { part: Part; onHand: number; onApproved: (id: string) => void; onCancel: () => void }) {
  const { emergencyIssue } = useStore();
  const [reason, setReason] = useState(REASONS[0]);
  const [tech, setTech] = useState<string>(TECHNICIANS[1]);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const press = (d: string) => { setErr(false); setPin((p) => (p.length < 4 ? p + d : p)); };
  const approve = () => {
    const e = emergencyIssue({ partId: part.id, qty: 1, technician: tech, reason, pin });
    if (!e) { setErr(true); setPin(""); return; }
    onApproved(e.id);
  };
  return (
    <div className="grid grid-cols-[1fr_250px] gap-8">
      <div>
        <Label>Emergency issue</Label>
        <h3 className="mt-1 font-serif text-[36px] leading-tight">Manager approval for 1× {part.short}</h3>
        <p className="mt-1 text-[14px] text-muted">The clock starts now: {OVERRIDE_WINDOW_MIN / 60} hours to link it to a job card. {onHand} on the shelf.</p>
        <Label className="mb-2 mt-6">Reason</Label>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button key={r} onClick={() => setReason(r)} className={cx("rounded-full border px-3.5 py-1.5 text-[13px]", r === reason ? "border-champagne bg-champagne-soft text-[#7d6238]" : "border-hair bg-white text-ink")}>{r}</button>
          ))}
        </div>
        <Label className="mb-2 mt-5">Technician</Label>
        <div className="flex flex-wrap gap-2">
          {TECHNICIANS.map((t) => (
            <button key={t} onClick={() => setTech(t)} className={cx("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]", t === tech ? "border-petrol bg-petrol-soft text-petrol" : "border-hair bg-white")}>
              <Avatar name={t} size={22} /> {t}
            </button>
          ))}
        </div>
        <div className="mt-8 flex gap-3">
          <Button variant="champagne" onClick={approve} disabled={pin.length < 4}><KeyRound size={15} /> Approve and issue</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
      <div className="rounded-2xl border border-hair bg-[#FBFAF7] p-5">
        <div className="flex items-center gap-2.5"><Avatar name={MANAGER} size={30} tone="ink" /><div><div className="text-[13.5px]">{MANAGER}</div><div className="text-[11.5px] text-muted">Service Manager PIN</div></div></div>
        <motion.div animate={err ? { x: [0, -8, 8, -4, 0] } : {}} className="my-5 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => <span key={i} className={cx("h-3.5 w-3.5 rounded-full border", pin.length > i ? "border-ink bg-ink" : err ? "border-oxblood" : "border-[#c9c5bb]")} />)}
        </motion.div>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) => k === "" ? <span key="blank" /> : (
            <button key={k} onClick={() => (k === "⌫" ? setPin((p) => p.slice(0, -1)) : press(k))} className="h-11 rounded-xl border border-hair bg-white font-serif text-[22px] hover:bg-subtle">{k}</button>
          ))}
        </div>
        <div className="mt-3 text-center text-[11.5px] text-muted">Demo PIN <Mono>{MANAGER_PIN}</Mono></div>
      </div>
    </div>
  );
}

export function ringColor(frac: number) {
  return frac > 0.5 ? "#B08D57" : frac > 0.2 ? "#C98A12" : "#A3302A";
}

function Countdown({ issueId, onNext }: { issueId: string; onNext: () => void }) {
  const { events, chains } = useStore();
  const now = useClock();
  const e = events.find((x) => x.id === issueId);
  const chain = chains.find((c) => c.issue.id === issueId);
  if (!e) return null;
  const deadline = new Date(e.ts).getTime() + OVERRIDE_WINDOW_MIN * 60000;
  const left = deadline - now;
  const frac = Math.max(0, left / (OVERRIDE_WINDOW_MIN * 60000));
  const linked = !!chain?.linked;
  const color = linked ? "#0E5E63" : ringColor(frac);
  const R = 92;
  const C = 2 * Math.PI * R;
  return (
    <div className="grid min-h-[500px] grid-cols-[300px_1fr] items-center gap-10">
      <div className="relative h-[260px] w-[260px]">
        <svg width="260" height="260" className="-rotate-90">
          <circle cx="130" cy="130" r={R} fill="none" stroke="#EFEDE7" strokeWidth="10" />
          <motion.circle cx="130" cy="130" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={C}
            animate={{ strokeDashoffset: C * (1 - (linked ? 1 : frac)) }} transition={{ duration: 0.8, ease: "easeOut" }} />
          <circle cx="130" cy="130" r={R + 18} fill="none" stroke="#DAD7CF" strokeWidth="1" strokeDasharray="2 6" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-label text-muted">{linked ? "Linked" : left > 0 ? "Time to link" : "Overdue"}</span>
          <span className="mt-1 font-serif text-[52px] leading-none" style={{ color: left > 0 || linked ? "#15171A" : "#A3302A" }}>{linked ? "✓" : countdown(Math.abs(left))}</span>
          <span className="mt-1.5 text-[12px] text-muted">of {OVERRIDE_WINDOW_MIN / 60}:00:00</span>
        </div>
      </div>
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne/40 bg-champagne-soft px-2.5 py-1 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#7d6238]"><ShieldAlert size={12} /> Emergency issue · unlinked</span>
        <h3 className="mt-3 font-serif text-[44px] leading-[1.05]">{e.qty}× {partById(e.partId).short} is out without a job card.</h3>
        <div className="mt-5 grid grid-cols-3 gap-4 text-[14px]">
          <Fact label="Technician">{e.technician}</Fact>
          <Fact label="Approved by">{e.approver}</Fact>
          <Fact label="Issued">{time(e.ts)} · {duration(now - new Date(e.ts).getTime())} ago</Fact>
        </div>
        <div className="mt-4 rounded-xl bg-subtle/70 px-4 py-2.5 text-[13.5px] text-muted">Reason: <span className="text-ink">{e.reason}</span></div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-muted">If no job card is linked by <span className="font-mono text-ink">{time(deadline)}</span>, this becomes an unlinked issue on the Leakage register, named against {e.technician} and {e.approver}.</p>
        <div className="mt-6 flex gap-3">
          <LinkButton issueId={issueId} />
          <Button variant="ghost" onClick={onNext}>Back to counter</Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="text-[10.5px] font-medium uppercase tracking-label text-muted">{label}</div><div className="mt-0.5 text-ink">{children}</div></div>;
}

function LinkButton({ issueId, compact }: { issueId: string; compact?: boolean }) {
  const { jobCards, link, chains } = useStore();
  const [open, setOpen] = useState(false);
  const chain = chains.find((c) => c.issue.id === issueId);
  if (chain?.linked) return <span className="inline-flex items-center gap-1.5 text-[13px] text-petrol"><Check size={14} /> Linked to {chain.linked.jobCardId}</span>;
  const tech = chain?.issue.technician;
  const options = jobCards.filter((j) => !j.invoicedAt && (!tech || j.technicians.includes(tech))).slice(-6).reverse();
  return (
    <div className="relative">
      <Button variant={compact ? "ghost" : "primary"} onClick={() => setOpen((o) => !o)} className={compact ? "px-3 py-1 text-[12px]" : ""}>{compact ? "Link" : "Link to job card"}</Button>
      {open && (
        <div className={cx("absolute top-[calc(100%+6px)] z-30 w-72", compact ? "right-0" : "left-0", "rounded-2xl border border-hair bg-white/95 p-1.5 shadow-float backdrop-blur")}>
          <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-label text-muted">Open job cards{tech ? ` for ${tech}` : ""}</div>
          {options.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">None open — create one at the counter.</div>}
          {options.map((j) => (
            <button key={j.id} onClick={() => { link(issueId, j.id); setOpen(false); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-subtle">
              <Mono>{j.id}</Mono><span className="text-[12.5px] text-muted">{j.model}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingLinks({ chains }: { chains: Chain[]; openJCs: JobCard[] }) {
  const now = useClock();
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <Label>Pending links</Label>
        <span className="text-[12px] text-muted">{chains.length} open</span>
      </div>
      {chains.length === 0 && <div className="py-3 text-[13.5px] text-muted">Nothing waiting. Every part out today has a job card.</div>}
      <div className="space-y-2.5">
        {chains.map((c) => {
          const left = (c.deadline ?? 0) - now;
          const frac = Math.max(0, left / (OVERRIDE_WINDOW_MIN * 60000));
          const R = 17, C = 2 * Math.PI * R;
          return (
            <div key={c.issue.id} className="flex items-center gap-3.5 rounded-xl border border-hair bg-[#FBFAF7] px-3.5 py-3">
              <svg width="44" height="44" className="-rotate-90 shrink-0">
                <circle cx="22" cy="22" r={R} fill="none" stroke="#EFEDE7" strokeWidth="3.5" />
                <circle cx="22" cy="22" r={R} fill="none" stroke={ringColor(frac)} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
              </svg>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-ink">{c.issue.qty}× {partById(c.issue.partId).short} <span className="text-muted">to</span> {c.issue.technician}</div>
                <div className="text-[12px] text-muted"><span className="font-mono text-ink">{countdown(left)}</span> left · approved by {c.issue.approver}</div>
              </div>
              <LinkButton issueId={c.issue.id} compact />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ReturnPanel({ onFresh }: { onFresh: (id: string) => void }) {
  const { chains, returnPart, now } = useStore();
  const [sel, setSel] = useState<string>();
  const [reason, setReason] = useState("Not required — diagnosis changed");
  const [done, setDone] = useState<string>();
  const since = now - 3 * 86400000;
  const list = chains.filter((c) => (c.status === "in-progress" || c.status === "pending-link") && new Date(c.issue.ts).getTime() > since).reverse().slice(0, 40);
  const chosen = list.find((c) => c.issue.id === sel);
  return (
    <Card className="grid min-h-[620px] grid-cols-[1fr_380px] overflow-hidden">
      <div className="p-7">
        <Label>Issued, not yet billed · last 3 days</Label>
        <h3 className="mt-1 font-serif text-[36px] leading-tight">Return an unused part</h3>
        <div className="scrollbar-thin mt-5 max-h-[470px] space-y-1.5 overflow-y-auto pr-1">
          {list.map((c) => (
            <button key={c.issue.id} onClick={() => { setSel(c.issue.id); setDone(undefined); }} className={cx("flex w-full items-center gap-4 rounded-xl border px-3 py-2.5 text-left", sel === c.issue.id ? "border-petrol bg-petrol-soft/50" : "border-transparent hover:border-hair hover:bg-[#FBFAF7]")}>
              <PartMedallion part={partById(c.issue.partId)} size={34} />
              <div className="min-w-0 flex-1"><div className="text-[14px] text-ink">{c.issue.qty}× {partById(c.issue.partId).short}</div><div className="text-[12px] text-muted">{c.issue.technician} · {time(c.issue.ts)}</div></div>
              <Mono className="text-muted">{c.jobCardId ?? "unlinked"}</Mono>
            </button>
          ))}
        </div>
      </div>
      <div className="border-l border-hair bg-[#FBFAF7] p-7">
        {chosen ? (
          done ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-petrol-soft text-petrol"><Check size={28} /></div>
              <div className="mt-4 font-serif text-[34px]">Back on the shelf.</div>
              <div className="mt-2 text-[13.5px] text-muted">{BINS[chosen.issue.partId]} · stock restored · RETURNED logged</div>
            </div>
          ) : (
            <>
              <PartMedallion part={partById(chosen.issue.partId)} size={64} />
              <div className="mt-4 font-serif text-[30px] leading-tight">{chosen.issue.qty}× {partById(chosen.issue.partId).short}</div>
              <div className="mt-1 text-[13px] text-muted">From {chosen.issue.technician} · {chosen.jobCardId ?? "no job card"} · back to <Mono>{BINS[chosen.issue.partId]}</Mono> ({zoneOf(chosen.issue.partId) === "PRIORITY" ? "Priority cage" : "Servicing racks"})</div>
              <Label className="mb-2 mt-6">Reason</Label>
              <div className="flex flex-col gap-2">
                {["Not required — diagnosis changed", "Wrong part picked", "Damaged in fitment — supplier claim", "Customer declined the work"].map((r) => (
                  <button key={r} onClick={() => setReason(r)} className={cx("rounded-xl border px-3.5 py-2 text-left text-[13px]", r === reason ? "border-petrol bg-white text-petrol" : "border-hair bg-white")}>{r}</button>
                ))}
              </div>
              <Button className="mt-6 w-full" onClick={() => { returnPart(chosen.issue.id, reason); setDone(chosen.issue.id); onFresh(chosen.issue.id); }}><Undo2 size={15} /> Return to shelf</Button>
            </>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-center text-[14px] text-muted">Pick a part on the left to return it.</div>
        )}
      </div>
    </Card>
  );
}
