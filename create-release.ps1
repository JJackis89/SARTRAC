# GitHub Release Creation Script
param(
    [Parameter(Mandatory=$true)]
    [string]$TagName,
    
    [Parameter(Mandatory=$true)]
    [string]$Title,
    
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [string]$Description = "Automated Sargassum forecast",
    [string]$Repo = "JJackis89/SARTRAC"
)

# You'll need to set your GitHub token as an environment variable
# $env:GITHUB_TOKEN = "your_github_token_here"

$headers = @{
    "Authorization" = "Bearer $env:GITHUB_TOKEN"
    "Accept" = "application/vnd.github.v3+json"
}

# Create the release
$releaseData = @{
    tag_name = $TagName
    name = $Title
    body = $Description
    draft = $false
    prerelease = $false
} | ConvertTo-Json

try {
    $releaseResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Method Post -Headers $headers -Body $releaseData -ContentType "application/json"
    Write-Host "Release created successfully: $($releaseResponse.html_url)"
    
    # Upload the file as an asset
    if (Test-Path $FilePath) {
        $fileName = Split-Path $FilePath -Leaf
        $uploadUrl = $releaseResponse.upload_url -replace '\{\?.*\}', "?name=$fileName"
        
        $fileContent = Get-Content $FilePath -Raw
        $uploadResponse = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Body $fileContent -ContentType "application/octet-stream"
        Write-Host "File uploaded successfully: $($uploadResponse.browser_download_url)"
    } else {
        Write-Error "File not found: $FilePath"
    }
} catch {
    Write-Error "Failed to create release: $($_.Exception.Message)"
}