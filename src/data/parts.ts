import raw from "../../parts.json";

export type Ved = "Vital" | "Safety" | "Essential" | "Comfort";
export type Route = "Domestic" | "Import";
export type Pattern = "Scheduled" | "Failure-Driven";
export type ScenarioId = "best" | "expected" | "stress";

export type Part = {
  id: string;
  slug: string;
  code: string;
  name: string;
  short: string;
  ved: Ved;
  route: Route;
  pattern: Pattern;
  D: number;
  unitCost: number;
  leadTimeNormal: number;
  leadTimeUrgent: number;
  emergencyPremium: number;
  supplier: string;
  origin: string;
  weightKg: number;
  isTest: boolean;
};

export type Scenario = {
  id: ScenarioId;
  label: string;
  description: string;
  varianceFloor: boolean;
  leadTimeCV: Record<Route, number>;
};

export type Assumptions = {
  holdingCostRate: number;
  orderingCost: Record<Route, number>;
  demandCV: Record<Pattern, number>;
  vedTable: Record<Ved, { floor: number; weight: number; zoneScore: number }>;
  priorityWeights: { criticality: number; urgency: number; financialExposure: number; recoveryRisk: number };
  zoneWeights: { criticality: number; consumption: number; cost: number; leadTime: number; priorityThreshold: number };
  naiveBufferDays: number;
  oldWay: { reviewDays: number; coverDays: number };
  casebook: { emergencyRate: number; premiumBand: number[]; shrinkageRate: number; annualProblemCostLakh: number[]; skus: number };
};

const SHORT: Record<string, string> = {
  "Engine Oil Filter": "Oil Filter",
  "Cabin AC Filter": "Cabin Filter",
  "Engine Oil MB 229.51 (5L)": "Engine Oil 5L",
  "Wiper Blade Set": "Wiper Blades",
  "Fuel Filter (diesel)": "Fuel Filter",
  "Front Brake Pads (Textar OE)": "Front Brake Pads",
  "Rear Brake Pads (Textar OE)": "Rear Brake Pads",
  "Front Brake Discs (pair)": "Front Brake Discs",
  "Spark Plugs, NGK Iridium (set/4)": "Spark Plugs",
  "Coolant MB 325.5 (5L)": "Coolant 5L",
  "9G-Tronic ATF Fluid (1L, top-up)": "ATF Fluid 1L",
  "9G-Tronic Transmission Service Kit": "Transmission Kit",
  "AGM Battery 80Ah (Varta OE)": "AGM Battery",
  "Serpentine Drive Belt": "Drive Belt",
  "Run-Flat Tyre 225/45 R18": "Run-Flat Tyre",
  "Engine Mount (hydraulic)": "Engine Mount",
  "Front Control Arm Assembly": "Control Arm",
  "Diesel Injector (C 220d)": "Diesel Injector",
  "AC Compressor Assembly": "AC Compressor",
  "Timing Chain Kit": "Timing Chain",
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const testSet: string[] = raw.testSet;

type RawPart = (typeof raw.catalogue)[number];

function toPart(p: RawPart, i: number): Part {
  const short = SHORT[p.name] ?? p.name;
  return {
    id: `P${String(i + 1).padStart(2, "0")}`,
    slug: slugify(short),
    code: `PT-${1001 + i}`,
    name: p.name,
    short,
    ved: p.ved as Ved,
    route: p.route as Route,
    pattern: p.pattern as Pattern,
    D: p.adjAnnualDemand,
    unitCost: p.unitCost,
    leadTimeNormal: p.leadTimeNormal,
    leadTimeUrgent: p.leadTimeUrgent,
    emergencyPremium: p.emergencyPremium,
    supplier: p.supplier,
    origin: p.origin,
    weightKg: p.weightKg,
    isTest: testSet.includes(p.name),
  };
}

const all = raw.catalogue.map(toPart);

/** Test-set parts first (in the Excel's order), then the rest. */
export const PARTS: Part[] = [
  ...testSet.map((n) => all.find((p) => p.name === n)!),
  ...all.filter((p) => !p.isTest),
];
export const TEST_PARTS = PARTS.filter((p) => p.isTest);

export const partById = (id: string) => PARTS.find((p) => p.id === id)!;
export const partBySlug = (slug: string) => PARTS.find((p) => p.slug === slug);

export const ASSUMPTIONS = raw.assumptions as unknown as Assumptions;

const rawScen = raw.assumptions.scenarios;
export const SCENARIOS: Record<ScenarioId, Scenario> = {
  best: { id: "best", ...rawScen.best },
  expected: { id: "expected", ...rawScen.expected },
  stress: { id: "stress", ...rawScen.stress },
};
export const HEADLINE_SCENARIO = rawScen.headline as ScenarioId;
export const SCENARIO_ORDER: ScenarioId[] = ["best", "expected", "stress"];

export const EXPECTED = raw.expected;
