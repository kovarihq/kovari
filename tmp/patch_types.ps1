$filePath = ".\packages\types\src\database.types.ts"
$content = Get-Content -Path $filePath -Raw

# Row replacement
$content = $content -replace "terms_version: string \| null\r?\n\s+}", "terms_version: string | null`r`n          account_type: `"USER`" | `"INTERNAL`" | `"ADMIN`"`r`n          is_internal: boolean`r`n          test_role: string | null`r`n        }"

# Insert replacement
$content = $content -replace "terms_version\?: string \| null\r?\n\s+}\r?\n\s+Update:", "terms_version?: string | null`r`n          account_type?: `"USER`" | `"INTERNAL`" | `"ADMIN`"`r`n          is_internal?: boolean`r`n          test_role?: string | null`r`n        }`r`n        Update:"

# Update replacement
$content = $content -replace "terms_version\?: string \| null\r?\n\s+}\r?\n\s+Relationships: \[\]", "terms_version?: string | null`r`n          account_type?: `"USER`" | `"INTERNAL`" | `"ADMIN`"`r`n          is_internal?: boolean`r`n          test_role?: string | null`r`n        }`r`n        Relationships: []"

Set-Content -Path $filePath -Value $content -Encoding Unicode
Write-Output "Patched types successfully"
