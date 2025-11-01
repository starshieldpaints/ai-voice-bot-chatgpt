# StarShield Voice Agent – Backend

## Prerequisites
- Node.js 18 or newer
- OpenAI API key with Realtime access enabled
- Azure Cognitive Search index (optional, for knowledge grounding)
- Dynamics 365 Sales Hub / Dataverse environment (optional, for live lead capture)

## Install & Run
```bash
npm install
npm run dev      # hot-reload during development
# or
npm start        # production mode
```

The server reads configuration from `.env`. The sample `.env` bundled with this repo highlights every supported key.

## Key Environment Variables
| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY`, `MODEL_ID`, `PROMPT_ID` | Configure the OpenAI realtime session |
| `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_INDEX`, `AZURE_SEARCH_API_KEY` | Enable Azure Cognitive Search tool calls |
| `DYNAMICS_TENANT_ID`, `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET`, `DYNAMICS_RESOURCE_URL` | Enable Dynamics 365 Sales Hub lead capture |
| `DYNAMICS_API_VERSION` | Optional override (defaults to `v9.2`) |

If the Dynamics variables are omitted the API will fall back to a stubbed lead generator so the voice flow keeps working during local development.

## Connecting to Dynamics 365 Sales Hub
1. **Register an Azure AD application**
   - Azure Portal → *Azure Active Directory* → *App registrations* → *New registration*.
   - Supported account type: *Single tenant* (recommended).
2. **Create a client secret**
   - App registration → *Certificates & secrets* → *New client secret*. Capture the generated value.
3. **Grant Dataverse API permissions**
   - App registration → *API permissions* → *Add a permission* → *Dynamics CRM* → *Delegated* → `user_impersonation`.
4. **Create an application user in your Dataverse environment**
   - Power Platform admin center → *Environments* → (select environment) → *Settings* → *Users + permissions* → *Application users* → *+ New app user*.
   - Pick the registered app and assign a security role that can create leads (e.g. *Salesperson* or a custom security role).
5. **Populate `.env`**
   ```env
   DYNAMICS_TENANT_ID=<Azure AD tenant GUID>
   DYNAMICS_CLIENT_ID=<App (client) ID>
   DYNAMICS_CLIENT_SECRET=<Client secret value>
   DYNAMICS_RESOURCE_URL=https://<your-org>.crm.dynamics.com
   # Optional:
   # DYNAMICS_API_VERSION=v9.2
   ```
6. **Restart the server** so the new credentials load. Successful calls to `POST /tool/create_lead` will return `{ source: "dynamics365", ... }`.

> Tip: if the API returns `{ source: "stub" }` the integration is still running in local fallback mode—double check the credentials, permissions, or app user role.

## Lead Capture Flow
- The public client now shows a **pre-chat lead form** (name, phone, optional email, project focus).
- Submitting the form pushes the lead to Dynamics 365 (or the local stub) *and* automatically starts the live microphone session.
- Once a lead has been synced the inputs lock, and the form’s start button can be used to reconnect after you stop the conversation.
- The on-screen status banner mirrors server health, while the form status line highlights CRM sync errors.

## Useful Endpoints
- `GET /health` – simple readiness probe
- `GET /session` – returns an ephemeral OpenAI realtime session token
- `POST /tool/create_lead` – backend endpoint invoked by the client and the model’s `create_lead` tool
- `POST /tool/search_docs` – proxied Azure Cognitive Search query (if configured)

## Troubleshooting
- 401/403 when creating leads usually indicates the Dataverse application user is missing the correct security role or the client secret expired.
- 404/5xx when starting the voice session generally trace back to missing `OPENAI_API_KEY` or firewall restrictions between the browser and OpenAI.
- Use the console logs in `src/services/dynamics365.js` (`[voice-agent]` prefix) to inspect CRM integration errors quickly.
