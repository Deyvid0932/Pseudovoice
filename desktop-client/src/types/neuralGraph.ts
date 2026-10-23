export type RuleCategory = "BEHAVIOR" | "ACOUSTIC" | "SAFETY" | "STYLE";

export type NodeStatus = "CONNECTED" | "OFFLINE";

export interface GraphRuleNode {
  id: string;
  ruleId: number;
  code: string;
  shortLabel: string;
  category: RuleCategory;
  priority: number;
  status: NodeStatus;
  promptDirective: string;
  // Dynamic or normalized radial polar angles
  angleDeg?: number;
  radiusPx?: number;
}
