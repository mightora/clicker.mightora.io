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

## Windows signing: action needed from the publisher

The project currently has **no trusted code-signing certificate**. Do not claim its releases are signed. To reduce Windows warnings:

1. Choose a consistent publisher identity. For a UK company, [Azure Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/) is a practical option subject to Microsoft's organisation identity verification, service availability and charges. A conventional organisation-validated code-signing certificate from a trusted CA is another option.
2. Complete identity validation and secure access in the owner's Azure or certificate provider account. Do not commit private keys or credentials to this repository.
3. Add a signing step on the Windows GitHub Actions runner **after packaging and before release upload**, using the provider's supported secure authentication. Sign and timestamp the PE file, then verify with `signtool verify /pa /v` and inspect the displayed publisher.
4. Recalculate SHA-256 checksums after signing, because signatures change the file bytes. Distribute the exact signed bytes that were checked.
5. Continue shipping from the same publisher identity and maintain reputation over time. New, correctly signed apps can still initially trigger SmartScreen warnings.

Microsoft's [SmartScreen reputation guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation) explains why unsigned downloads and new signed files are challenged. Extended Validation certificates no longer bypass SmartScreen reputation checks. Windows 11 Smart App Control may block untrusted applications entirely, independent of the user's willingness to proceed.

### Important constraints

- Do not disable SmartScreen or recommend bypassing an organisation's security policy.
- Do not use a self-signed certificate for public distribution as though it were publicly trusted.
- A signed binary is not necessarily safe: review code, dependencies, build provenance and publisher identity as well.
- For managed devices, IT-approved distribution (such as an organisation-managed application catalogue) may be necessary.

## Further code quality checks

The repo runs GitHub Actions build/unit tests, CodeQL for JavaScript and Python, a scheduled dependency and Bandit/Ruff security audit, and executable startup checks. They are not a formal penetration test. Review warnings, third-party dependency advisories and reports before shipping each release.
