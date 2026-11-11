# PM shared-route audit (epc-workspace)

Audited frontend callers of `EpcWorkspaceController` global routes (`/my-work`, `/review-inbox`, `/my-comments`, design-package helpers):

- All usages live under `frontend/components/modules/projects/**`, `frontend/lib/query/epc-workspace.ts`, and PM dashboard widgets.
- No HR, approvals, or org (`/disciplines`) pages call these APIs directly.

`EpcWorkspaceController` remains fully behind `@PmApi()` / `PmModuleEnabledGuard`.

Reporting `GET /dashboard/*` lives in `reporting` module (not PM controllers) and is unchanged.
