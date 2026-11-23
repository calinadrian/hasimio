# Always install for the current user: no administrator prompt, and updates stay silent.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

# Runs after the folder page. Updating and uninstalling delete the whole install folder, so never accept
# a folder that holds anything other than Hasimio, or one this user can't write to.
!macro customPageAfterChangeDir
  Page custom checkInstallDir

  Function checkInstallDir
    ${if} ${isUpdated}
      Abort
    ${endIf}

    # Give Hasimio its own folder unless the chosen one is already named for it.
    ${GetFileName} "$INSTDIR" $0
    ${if} $0 == "${APP_FILENAME}"
      # One-click versions used a lowercase folder; match electron-builder's case-sensitive check, which
      # would otherwise nest another folder inside it. Windows treats both spellings as the same folder.
      ${GetParent} "$INSTDIR" $0
      StrCpy $INSTDIR "$0\${APP_FILENAME}"
    ${else}
      StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
    ${endIf}

    StrCpy $1 ""
    ${ifNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${orIfNot} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
      FindFirst $2 $3 "$INSTDIR\*.*"
      ${doWhile} $3 != ""
        ${if} $3 != "."
        ${andIf} $3 != ".."
          StrCpy $1 "This folder already contains other files:$\r$\n$INSTDIR$\r$\n$\r$\nGo back and choose an empty or new folder."
          ${exitDo}
        ${endIf}
        FindNext $2 $3
      ${loop}
      FindClose $2
    ${endIf}

    ${if} $1 == ""
      ClearErrors
      CreateDirectory "$INSTDIR"
      GetTempFileName $2 "$INSTDIR"
      ${if} ${Errors}
        StrCpy $1 "You don't have permission to install here:$\r$\n$INSTDIR$\r$\n$\r$\nGo back and choose another folder."
      ${else}
        Delete $2
        RMDir "$INSTDIR" # only removes it while empty
      ${endIf}
    ${endIf}

    ${if} $1 == ""
      Abort # the folder is fine, skip this page
    ${endIf}

    !insertmacro MUI_HEADER_TEXT "Choose another folder" "${PRODUCT_NAME} can't be installed in this folder."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 60u "$1"
    Pop $0
    GetDlgItem $0 $HWNDPARENT 1
    EnableWindow $0 0
    nsDialogs::Show
  FunctionEnd
!macroend
