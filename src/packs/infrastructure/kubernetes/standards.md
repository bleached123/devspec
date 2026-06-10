## Kubernetes manifests

- Target Kubernetes **1.30+** as the minimum supported control plane. Older versions miss security and sidecar features below.
- Manifests live in `deploy/k8s/` or a Helm chart under `deploy/charts/<service>/`.
- One file per resource kind (`deployment.yaml`, `service.yaml`, `configmap.yaml`), not omnibus YAML.
- Every Deployment has explicit `resources.requests` AND `resources.limits` for CPU and memory. No exceptions in production.
- Every Pod template has `securityContext.runAsNonRoot: true` and `readOnlyRootFilesystem: true` unless documented otherwise.
- `imagePullPolicy: IfNotPresent` in production. `Always` only for dev/staging with mutable tags.

## Security (current best practice)

- **Pod Security Admission** at the `restricted` profile on all production namespaces:
  ```yaml
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
  ```
- PSPs are removed — don't reintroduce. Use PSA + admission controllers (Kyverno, OPA Gatekeeper).
- Drop all capabilities by default: `securityContext.capabilities.drop: [ALL]`. Add back only what's needed with a comment.
- `seccompProfile: { type: RuntimeDefault }` at the pod level.
- NetworkPolicies default-deny + explicit allow rules per namespace.

## Sidecars

- Use **native sidecar containers** (`restartPolicy: Always` on an `initContainers` entry, stable in 1.29+) for log shippers, proxies, and config reloaders.
- Don't use the old "regular container + ordering hacks" pattern — native sidecars handle startup ordering and graceful shutdown correctly.

## Namespaces

- One namespace per environment (`production`, `staging`, `preview-<branch>`).
- Don't share namespaces across teams. Use ResourceQuotas and LimitRanges per namespace.
- Service-to-service communication uses cluster DNS (`service.namespace.svc.cluster.local`), not external load balancers.

## Configuration

- Non-secret config: ConfigMaps, mounted as files or env vars.
- Secrets: ExternalSecrets (preferred, integrates with cloud KMS) or SealedSecrets — never raw `Secret` objects committed to git.
- Application reads config from files when possible. Env vars only for trivial keys.
- For pod-level identity to cloud APIs, use **Workload Identity** (GKE) / **IRSA** (EKS) / **Workload Identity Federation** (Azure) — never long-lived service-account keys in Secrets.

## Probes and health

- Every container has `readinessProbe` and `livenessProbe`. `startupProbe` if startup is slow.
- Readiness fails fast on dependency outages (DB, cache). Liveness only on irrecoverable state.
- HTTP probes hit a dedicated `/healthz` endpoint, not a business endpoint.
- Use `grpc` probe type for gRPC services (1.27+ GA) — no exec scripts.

## Deployment hygiene

- Rolling updates with `maxUnavailable: 0` for stateless services in production.
- PodDisruptionBudgets to prevent voluntary disruption from taking the service offline.
- HorizontalPodAutoscaler defined for production deployments with realistic min/max bounds.
- Use `topologySpreadConstraints` to distribute pods across zones/nodes for HA.

## Observability

- Containers log to stdout/stderr as **structured JSON** (one event per line). Cluster log collector ships to your aggregator — applications don't write log files.
- Prometheus scrape annotations or ServiceMonitor (Prometheus Operator).
- OpenTelemetry SDK for traces and metrics, exporting to the collector running as a sidecar or DaemonSet.

## What to avoid

- `latest` image tags in production.
- `hostNetwork`, `hostPID`, `hostIPC` unless absolutely required + reviewed.
- Privileged containers — if you reach for `privileged: true`, you almost certainly want a CSI driver or operator instead.
- Cluster-wide ClusterRoleBindings to wide-permission roles — scope to namespaces.
