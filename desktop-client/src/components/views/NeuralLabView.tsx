import { memo } from "react";
import type { NotifyInput } from "../../hooks/useToasts";
import { useRuleGraph } from "../../hooks/useRuleGraph";
import { sessionConfigStore } from "../../lib/sessionConfigStore";
import { RuleGraph } from "../graph/RuleGraph";
import { NodeDetailPanel } from "../graph/NodeDetailPanel";

export interface NeuralLabViewProps {
  onNotify: (input: NotifyInput) => void;
}

function NeuralLabViewComponent({
  onNotify,
}: NeuralLabViewProps) {
  const graph = useRuleGraph();
  const { selectedNode, snapshot } = graph;

  const selectedPriority = selectedNode
    ? (snapshot.priorities[selectedNode.id] ?? selectedNode.priority)
    : 0;
  const selectedConnected = selectedNode
    ? Boolean(snapshot.connected[selectedNode.id])
    : false;

  return (
    <section
      aria-label="Neural lab"
      className="pv-product-page mx-auto flex w-full max-w-[1720px] flex-1 min-h-0 flex-col gap-5 px-6 py-6 overflow-y-auto pv-scroll"
    >
      <div>
          <p className="pv-kicker text-zinc-500">
            <span className="text-zinc-600">02</span>
            <span className="px-1.5 text-zinc-700">/</span>
            <span className="text-teal-400">Configuration Workspace</span>
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            <span className="text-zinc-100">Neural Lab Rule </span>
            <span className="text-teal-400">Graph</span>
          </h1>
      </div>

      <div className="min-h-0 flex-1">
        <RuleGraph
          nodes={graph.nodes}
          onAddRule={() =>
            onNotify({
              title: "Regla añadida al catálogo",
              description:
                "El nuevo nodo se sincronizará con el motor en la próxima sesión.",
              variant: "success",
            })
          }
        />
      </div>

      <NodeDetailPanel
        node={selectedNode}
        priority={selectedPriority}
        connected={selectedConnected}
        onClose={() => sessionConfigStore.select(null)}
        onToggleConnected={() => {
          if (selectedNode) {
            graph.setNodeConnected(selectedNode.id, !selectedConnected);
          }
        }}
        onPriorityChange={(value) => {
          if (selectedNode) {
            graph.setNodePriority(selectedNode.id, value);
          }
        }}
        onTestVoice={() =>
          onNotify({
            title: "Síntesis de prueba enviada",
            description: selectedNode
              ? `Reproduciendo muestra con ${selectedNode.name}.`
              : "Reproduciendo muestra de voz.",
            variant: "info",
          })
        }
        onUnlink={() => {
          if (selectedNode) {
            graph.setNodeConnected(selectedNode.id, false);
            onNotify({
              title: `${selectedNode.name} desvinculado`,
              description: "El nodo pasa a OFFLINE dentro del session_config.",
              variant: "warning",
            });
          }
        }}
      />

      <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
        <span className="pv-kicker shrink-0 rounded border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-teal-300">
          Live system prompt preview
        </span>
        <p className="pv-mono line-clamp-2 min-w-0 flex-1 text-[11px] leading-relaxed text-zinc-500">
          {graph.promptPreview || "Sin reglas conectadas."}
        </p>
      </div>
    </section>
  );
}

export const NeuralLabView = memo(NeuralLabViewComponent);
