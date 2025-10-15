# 🔧 GitHub Actions Release Fix Guide

## 🚨 Current Issue
The GitHub Actions workflow is failing with **403 Forbidden** errors when trying to create releases, even though we have `contents: write` permissions.

## 🎯 Root Cause Analysis
The 403 error typically occurs due to one of these issues:

1. **Repository Settings**: Actions permissions might be restricted
2. **Token Scope**: The `GITHUB_TOKEN` might not have sufficient permissions
3. **Branch Protection**: Rules might be preventing the action
4. **Organization Settings**: Enterprise/organization policies might restrict Actions

## 🛠️ Fix Options

### Option 1: Check Repository Settings (RECOMMENDED)

1. **Go to Repository Settings**:
   - Navigate to: `JJackis89/SARTRAC` → **Settings** → **Actions** → **General**

2. **Actions Permissions**:
   - Ensure "Allow all actions and reusable workflows" is selected
   - OR ensure "Allow select actions and reusable workflows" includes `softprops/action-gh-release`

3. **Workflow Permissions**:
   - Set to: **"Read and write permissions"**
   - Check: **"Allow GitHub Actions to create and approve pull requests"**

4. **Save Changes** and re-run the workflow

### Option 2: Use Personal Access Token (PAT)

If repository settings don't work, create a Personal Access Token:

1. **Create PAT**:
   - Go to: GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
   - Click "Generate new token (classic)"
   - Select scopes: `repo`, `workflow`, `write:packages`
   - Generate and copy the token

2. **Add to Repository Secrets**:
   - Go to: Repository → **Settings** → **Secrets and variables** → **Actions**
   - Add new secret: `PAT_TOKEN` = `your_personal_access_token`

3. **Update Workflow**: Replace `GITHUB_TOKEN` with `PAT_TOKEN` in the release step

### Option 3: Alternative Release Method

Use a different approach that doesn't require the action:

```yaml
- name: Create Release with GitHub CLI
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    # Create or update release using gh CLI
    gh release create "${{ env.RELEASE_TAG }}" \
      --title "Sargassum Forecast ${{ env.FORECAST_DATE }}" \
      --notes "Ghana Sargassum Forecast for ${{ env.FORECAST_DATE }}" \
      --latest \
      outputs/forecast_${{ env.FORECAST_DATE }}.geojson \
      data/merged_detections_${{ env.FORECAST_DATE }}.geojson \
      outputs/map_${{ env.FORECAST_DATE }}.png \
      || gh release upload "${{ env.RELEASE_TAG }}" \
         outputs/forecast_${{ env.FORECAST_DATE }}.geojson \
         data/merged_detections_${{ env.FORECAST_DATE }}.geojson \
         outputs/map_${{ env.FORECAST_DATE }}.png \
         --clobber
```

## ✅ Verification Steps

After implementing any fix:

1. **Manual Trigger**: Go to Actions → "Daily Sargassum Forecast" → "Run workflow"
2. **Check Logs**: Monitor the release creation step
3. **Verify Release**: Check if release appears in the Releases tab
4. **Test Files**: Ensure files are attached and downloadable

## 🔍 Debugging Commands

To troubleshoot further, add this debug step to the workflow:

```yaml
- name: Debug GitHub Token Permissions
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    echo "Checking GitHub CLI authentication..."
    gh auth status
    
    echo "Checking repository permissions..."
    gh api repos/${{ github.repository }} --jq '.permissions'
    
    echo "Testing release creation permissions..."
    gh api repos/${{ github.repository }}/releases --method GET || echo "Cannot list releases"
```

## 🎯 Recommended Action Plan

1. **First**: Check repository settings (Option 1)
2. **If that fails**: Try the GitHub CLI approach (Option 3)
3. **Last resort**: Use Personal Access Token (Option 2)

## 📞 Additional Support

If all options fail, the issue might be:
- Organization-level restrictions
- Enterprise security policies
- Repository-specific protection rules

Check with your GitHub organization admin or contact GitHub Support.