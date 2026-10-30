# Publishing and signing Mightora Clicker

The browser app is deployed to Cloudflare. The native companions are built on GitHub-hosted Windows, macOS and Linux runners with PyInstaller `--onefile`, so end users do not need Python.

## Release pipeline

1. A push to `main` runs unit tests, syntax checks and dependency audits.
2. The release workflow packages each OS executable and runs its `--help` smoke test.
3. GitHub Actions publishes the files to a new versioned release and generates `SHA256SUMS.txt`.
4. The website points to the latest public GitHub Release for direct downloads.
5. CI badges link to their actual workflows. A green badge records a passed automated job, not an independent certification or malware-free guarantee.

Check a Windows download's SHA-256 hash in PowerShell:

```powershell
Get-FileHash .\mightora-clicker-windows.exe -Algorithm SHA256
```

Compare the hexadecimal value with the Windows EXE line in `SHA256SUMS.txt` on the same GitHub Release.

## Windows signing: Azure Artifact Signing (integration ready)

The [portable desktop release workflow](../.github/workflows/desktop-releases.yml) now uses Microsoft's [Azure Artifact Signing GitHub Action](https://github.com/Azure/artifact-signing-action) with short-lived GitHub-to-Azure **OpenID Connect (OIDC)** authentication. No private signing key or long-lived Azure credential is stored in this repository.

**Integration does not mean the EXE is signed yet.** Identity verification and the following configuration must be completed in the publisher's Azure subscription. Until then, releases continue to be explicitly labelled **unsigned**. The release notes reflect the actual Windows binary's verified signing status.

### Confirmed publisher and trading-name distinction

- **Legal organisation for Microsoft verification and the public certificate subject:** **TWEED TECHNOLOGY LIMITED** (Companies House number **07820713**), [official register](https://find-and-update.company-information.service.gov.uk/company/07820713).
- **Trading name and application brand:** **Mightora**; the [Mightora legal notice](https://mightora.io/about/) identifies the company behind the trading name.
- Use the company's exact current registered name and address when applying. Microsoft validates the legal organisation and does not let public-trust certificate holders choose an arbitrary brand as the verified publisher.
- **Not yet provisioned:** No Azure signing account, certificate profile, Entra service principal, or chargeable signing subscription has been created through this work. The unsigned release remains available until the publisher elects to continue.

### 1. Create the Microsoft resources

1. Sign in to the [Azure portal](https://portal.azure.com). Follow the [official setup quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) to create an Artifact Signing account in a supported region, then choose a **Public Trust** certificate profile for publicly downloadable Windows software. The subscription incurs the applicable service charges.
2. Complete **Public organisation identity verification** in the Azure portal for **TWEED TECHNOLOGY LIMITED**, company number **07820713**. Do not submit the trading name alone as the legal entity. The approving Azure user may need the **Artifact Signing Identity Verifier** role. Prepare two different monitored email addresses on the same domain owned by the legal entity and the representative's government-ID-matching details.
3. Once the identity is approved, create a certificate profile (for example `mightora-clicker`). Note the account name, profile name, and **regional endpoint** from Microsoft documentation for your account's region.
4. In Microsoft Entra ID create a dedicated **application registration and service principal** for GitHub signing. Add a **federated identity credential** with:

   | Field | Value |
   | --- | --- |
   | GitHub organisation | `mightora` |
   | Repository | `clicker.mightora.io` |
   | Entity type | Branch |
   | Branch | `main` |
   | Token issuer | `https://token.actions.githubusercontent.com` |
   | Token subject | `repo:mightora/clicker.mightora.io:ref:refs/heads/main` |
   | Audience | `api://AzureADTokenExchange` |

5. Assign this service principal the **Artifact Signing Certificate Profile Signer** role on the signing account or at the narrowest supported scope. General Azure Contributor permission alone is insufficient. Protect GitHub `main` with appropriate review controls, since its workflow will have signing authority.

See Microsoft's [role assignment guide](https://learn.microsoft.com/en-us/azure/artifact-signing/tutorial-assign-roles) and the [GitHub Action OIDC guide](https://github.com/Azure/artifact-signing-action/blob/main/docs/OIDC.md) for permissions troubleshooting.

### 2. Connect GitHub Actions

Open `mightora/clicker.mightora.io` > **Settings > Secrets and variables > Actions**. Configure these **repository secrets**:

| Secret | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | Signing service principal's application (client) ID |
| `AZURE_TENANT_ID` | Microsoft Entra Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |

Configure these **repository variables**:

| Variable | Value |
| --- | --- |
| `ARTIFACT_SIGNING_ENDPOINT` | Account's regional HTTPS signing endpoint |
| `ARTIFACT_SIGNING_ACCOUNT` | Artifact Signing account resource name |
| `ARTIFACT_SIGNING_PROFILE` | Public Trust certificate profile name |
| `ARTIFACT_SIGNING_ENABLED` | `true` (set this **last**) |

No signing keys or passwords belong in GitHub. This integration authenticates with short-lived OIDC tokens and an Azure service principal limited to the signing role.

### 3. Test the first signed build

1. Once Azure identity verification, account, profile, RBAC and federation are complete, set `ARTIFACT_SIGNING_ENABLED=true`.
2. Run **Actions > Portable desktop downloads > Run workflow** on `main` to test. The Windows job signs, timestamps and verifies the binary using Authenticode. Any missing configuration or signing/verification error stops the job and blocks release publication.
3. Push a commit to `main` to create the next public GitHub Release. Manual workflow runs validate packaging but intentionally do **not** publish a release. Release notes claim a signed Windows EXE only after signature and timestamp verification succeed.
4. Download the Windows EXE from that release and inspect **Properties > Digital Signatures**, or use PowerShell:

   ```powershell
   $signature = Get-AuthenticodeSignature .\mightora-clicker-windows.exe
   $signature | Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
   ```

   `Status` should be `Valid`; inspect the legal publisher and timestamp. Compare its SHA-256 hash with the release's `SHA256SUMS.txt`, generated **after** any signing step.

5. Update the website's Windows download guidance once the first **actual signed release** is confirmed. Do not update trust claims merely because the workflow supports signing.

When `ARTIFACT_SIGNING_ENABLED` is off or absent, the workflow still produces an explicitly **unsigned** Windows EXE. When enabled, signing **fails closed** and never silently falls back to unsigned bytes. macOS/Linux signing is separate and not covered by this integration.

Microsoft's [SmartScreen reputation guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation) explains why unsigned downloads and new signed files are challenged. Extended Validation certificates no longer bypass SmartScreen reputation checks. Windows 11 Smart App Control may block untrusted applications entirely, independent of the user's willingness to proceed.

### Important constraints

- Do not disable SmartScreen or recommend bypassing an organisation's security policy.
- Do not use a self-signed certificate for public distribution as though it were publicly trusted.
- A signed binary is not necessarily safe: review code, dependencies, build provenance and publisher identity as well.
- For managed devices, IT-approved distribution (such as an organisation-managed application catalogue) may be necessary.

## Further code quality checks

The repo runs GitHub Actions build/unit tests, CodeQL for JavaScript and Python, a scheduled dependency and Bandit/Ruff security audit, and executable startup checks. They are not a formal penetration test. Review warnings, third-party dependency advisories and reports before shipping each release.
