# GitHub Copilot Provider Example

This example demonstrates how to use GitHub Copilot as the AI provider via the OpenCode SDK.

## Prerequisites

- A GitHub repository
- A GitHub Copilot subscription (Individual, Business, or Enterprise)

## Copilot Token Setup

1. **Generate a Personal Access Token** — Go to **GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)** and create a new token with the `copilot` scope.

2. **Store the token as a JSON secret** — Go to your repository's **Settings > Secrets and variables > Actions** and add a secret named `COPILOT_AUTH` with the following JSON value:

   ```json
   {
     "provider": {
       "copilot": {
         "token": "ghu_your_token_here"
       }
     }
   }
   ```

3. **Copy the workflow files** — Copy `workflow.md` and `.github/workflows/run-ai.yml` to your repository.

4. **Trigger the workflow** — Go to **Actions > Run AI Workflow (Copilot)** and click **Run workflow**.

## How It Works

The workflow writes the `COPILOT_AUTH` secret to a temporary `auth.json` file at runtime. This file is passed to the action via the `auth_config` input. The OpenCode SDK reads the authentication credentials from this file and uses them to connect to the GitHub Copilot API.

The `auth.json` structure follows the OpenCode SDK's provider configuration format:

```json
{
  "provider": {
    "copilot": {
      "token": "ghu_xxxxx"
    }
  }
}
```

## Security

- The auth file is written from GitHub Secrets at runtime — it is never stored in the repository
- The secret value is automatically masked in workflow logs
- The auth file exists only for the duration of the workflow run
- Always use `${{ secrets.COPILOT_AUTH }}` to reference the token, never hardcode it

## Customization

- Edit `workflow.md` to change the AI prompt
- See the [main README](../../README.md) for all available inputs
