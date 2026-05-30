# Test Fixtures

이 폴더는 Day 2 ~ Day 10 의 자동 테스트 + 수동 검증용 fixture 파일을 보관합니다.

## 현재 포함

| 파일 | 인코딩 | 용도 |
|------|--------|------|
| `utf8-korean.txt` | UTF-8 | 기본 한글 텍스트 (Day 2 정상 케이스) |
| `utf8-korean-v2.txt` | UTF-8 | 위 파일의 수정본 (Day 2 비교 검증용) |
| `empty.txt` | UTF-8 | 빈 파일 |

## 추가로 만들어야 할 파일

PowerShell 에서 직접 생성:

### CP949 한글 파일 (Critical Gap 1 검증용)

```powershell
$content = @"
안녕하세요
이 파일은 CP949(EUC-KR) 로 저장되어야 합니다.
한글이 정상 표시되어야 합니다.
"@
$bytes = [System.Text.Encoding]::GetEncoding(949).GetBytes($content)
[System.IO.File]::WriteAllBytes("test\fixtures\cp949-korean.txt", $bytes)
```

### UTF-8 BOM 파일

```powershell
$content = "BOM 테스트 파일`r`n이 줄도 정상이어야 합니다."
$utf8WithBom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllBytes("test\fixtures\utf8-bom.txt", $utf8WithBom.GetPreamble() + $utf8WithBom.GetBytes($content))
```

### 작은 바이너리 파일 (PNG 또는 PDF 시뮬)

```powershell
# null byte 가 많은 가짜 바이너리 파일 (실제 PNG/PDF 대신 검사 로직만 검증)
$bytes = New-Object byte[] 1024
for ($i = 0; $i -lt 1024; $i++) {
    if ($i % 5 -eq 0) { $bytes[$i] = 0 }   # 20% null byte = 바이너리로 감지
    else { $bytes[$i] = Get-Random -Min 1 -Max 255 }
}
[System.IO.File]::WriteAllBytes("test\fixtures\fake-binary.bin", $bytes)
```

또는 실제 PNG/PDF 파일을 이 폴더에 복사:
```powershell
Copy-Item "C:\Windows\Web\Wallpaper\Windows\img0.jpg" "test\fixtures\binary.jpg"
```

### CRLF / LF 비교 파일

```powershell
"line 1`r`nline 2`r`nline 3" | Out-File -Encoding utf8 -NoNewline "test\fixtures\crlf.txt"
"line 1`nline 2`nline 3" | Out-File -Encoding utf8 -NoNewline "test\fixtures\lf.txt"
```

## 검증 매트릭스 (Day 2 수동 검증)

| 시나리오 | 슬롯 A | 슬롯 B | 기대 |
|---------|--------|--------|------|
| 기본 한글 비교 | utf8-korean.txt | utf8-korean-v2.txt | 정상 diff, 한글 깨짐 없음 |
| CP949 호환성 | cp949-korean.txt | utf8-korean.txt | 양쪽 한글 정상 |
| BOM 처리 | utf8-bom.txt | (다른 텍스트) | BOM 자동 제거, 첫 줄 정상 |
| 빈 파일 | empty.txt | utf8-korean.txt | 빈 파일 정상 처리 |
| 바이너리 거부 | fake-binary.bin | — | 모달 표시 → 취소 |
| 권한 오류 | (잠긴 파일) | — | "다른 프로그램이..." 에러 |
