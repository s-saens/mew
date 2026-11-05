#ifndef MewVersion
  #error MewVersion must be supplied by the release builder
#endif
#ifndef Payload
  #error Payload must be supplied by the release builder
#endif

[Setup]
AppId={{6F77D674-A705-449D-B21D-048E72732331}
AppName=Mew
AppVersion={#MewVersion}
AppPublisher=Mew
DefaultDirName={localappdata}\Programs\Mew
DisableDirPage=yes
DefaultGroupName=Mew
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible and not arm64
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputBaseFilename=mew-windows-setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupLogging=no
CloseApplications=no
RestartApplications=no
UninstallDisplayName=Mew
UninstallDisplayIcon={sys}\shell32.dll,71
SetupMutex=MewSetup-6F77D674-A705-449D-B21D-048E72732331

[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Mew"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 71

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; Description: "Open Mew"; Flags: nowait postinstall skipifsilent runhidden; Check: CanOpenMew

[UninstallDelete]
Type: files; Name: "{app}\MewSetup.exe"
Type: files; Name: "{app}\setup-error.txt"

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\uninstall.ps1"""; Flags: runhidden waituntilterminated

[Code]
var
  RestartRequired: Boolean;
  SetupCompleted: Boolean;

function CanOpenMew: Boolean;
begin
  Result := SetupCompleted and not RestartRequired;
end;

function NeedRestart: Boolean;
begin
  Result := RestartRequired;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  ResumeExe: String;
  ErrorText: AnsiString;
begin
  if CurStep = ssPostInstall then begin
    WizardForm.StatusLabel.Caption := 'Preparing your computer and installing Mew. This may take several minutes.';
    ResumeExe := ExpandConstant('{app}\MewSetup.exe');
    if CompareText(ExpandConstant('{srcexe}'), ResumeExe) <> 0 then
      if not CopyFile(ExpandConstant('{srcexe}'), ResumeExe, False) then
        RaiseException('Mew could not save its setup recovery file. Run Setup again.');
    DeleteFile(ExpandConstant('{app}\setup-error.txt'));
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ' + AddQuotes(ExpandConstant('{app}\install.ps1')) +
      ' -AppRoot ' + AddQuotes(ExpandConstant('{app}')) + ' -ResumeExecutable ' + AddQuotes(ResumeExe),
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Code) then
      RaiseException('Mew setup could not continue. Run Setup again.');
    RestartRequired := Code = 3010;
    if (Code <> 0) and not RestartRequired then begin
      if not LoadStringFromFile(ExpandConstant('{app}\setup-error.txt'), ErrorText) then
        ErrorText := 'Mew could not finish installing. Run Setup again; your accounts and projects are preserved.';
      RaiseException(Utf8Decode(ErrorText));
    end;
    SetupCompleted := Code = 0;
    if RestartRequired then
      WizardForm.FinishedLabel.Caption := 'Restart your computer to continue installing Mew. Setup will reopen after you sign in. You can also run this installer again later.';
  end;
end;
