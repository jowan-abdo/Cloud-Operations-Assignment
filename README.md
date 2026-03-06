# Cloud Operations Assignment

This is my cloud operations assignment where I explored two things that come up a lot in real production environments: autoscaling Kubernetes workloads based on actual traffic (not just CPU), and handling secrets properly so you're not just dumping passwords in config files.

---

## Part 1 - Autoscaling with KEDA

The default Kubernetes autoscaler (HPA) only looks at CPU and memory. That's fine, but it's pretty limited - your pods might be under CPU pressure for totally different reasons than actual user traffic, and vice versa. KEDA fixes this by letting you scale on basically anything you can measure.

For this part I set up an nginx deployment and wired it up to Prometheus so I could track actual connection rates. The nginx container exposes its internal stats via `stub_status`, a small exporter sidecar picks those up, and Prometheus scrapes them every 15 seconds through a `ServiceMonitor`.

The interesting part is the `ScaledObject` - it has three triggers running at the same time:

- A **cron trigger** that automatically scales the deployment down to 1 replica between 20:00 and 06:00 (Brussels time). No point running 5 replicas overnight when nobody's using it.
- A **CPU trigger** as a fallback for compute-heavy situations.
- A **Prometheus trigger** that watches the actual nginx connection rate and scales up when connections start coming in fast.

So the cluster responds to real traffic, not to a delayed CPU spike. That's the key difference - by the time CPU reacts to a traffic burst, you've already missed the window. Prometheus-based scaling catches it earlier.

---

## Part 2 - Secrets Management with Vault

This part was about getting rid of hardcoded credentials. In a lot of projects, database passwords and API keys end up in environment variables, config files, or worse - committed to git. Vault solves this properly.

I implemented three different ways of getting secrets into pods, each a step more sophisticated than the last.

**The first approach** uses the Vault Secrets Operator. You define a `VaultStaticSecret` resource that points to a path in Vault, and it automatically syncs the secret into a regular Kubernetes `Secret` object. The app just reads it as an env variable and doesn't know or care where it came from. The secret refreshes every 30 seconds, so if someone rotates it in Vault, the pod picks it up without a restart.

**The second approach** uses the Vault Agent Injector sidecar. Instead of a Kubernetes Secret sitting in etcd, the secret gets written directly to the pod's filesystem at `/vault/secrets/`. The pod authenticates to Vault using its own Kubernetes service account - no passwords needed to get passwords. The sidecar handles all the token renewal and re-injection transparently.

**The third approach** is the most interesting one. Instead of syncing a static password, Vault generates a fresh PostgreSQL username and password on the spot when the pod starts up. These credentials are temporary - they expire on their own, and each pod gets its own unique pair. I deployed a Postgres 16 StatefulSet as the target database and configured Vault's database secrets engine to manage it. If a credential ever leaked, it would be useless in a short time, and you can trace exactly which pod it belonged to.

**The OIDC demo** (`vault-passport-demo`) is a small Express.js app that uses Vault as a login provider. It goes through the full OpenID Connect flow using Passport.js - you hit `/login`, get redirected to Vault, authenticate, and come back with a session. The point was to show that Vault isn't just a secret store, it can also act as a centralized identity provider for internal tools.

---

## Why any of this matters

Most security incidents involving credentials happen because someone stored a password somewhere they shouldn't have, and it sat there until someone found it. The Vault setup here means there are no long-lived passwords to find - they either expire on their own or never exist as static values in the first place.

The KEDA setup is more of an efficiency and reliability thing. Autoscaling that actually tracks what users are doing (connections, queue depth, whatever your app produces) is just more accurate than hoping CPU is a good proxy for load.

---

## Tech used

- Kubernetes, KEDA, Prometheus (kube-prometheus-stack)
- HashiCorp Vault, Vault Secrets Operator
- PostgreSQL 16
- Node.js, Express, Passport.js
