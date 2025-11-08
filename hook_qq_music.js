const TARGET_DLL = "QQMusicCommon.dll";

var EncAndDesMediaFileConstructorAddr = Module.findExportByName(
  TARGET_DLL,
  "??0EncAndDesMediaFile@@QAE@XZ"
);

var EncAndDesMediaFileDestructorAddr = Module.findExportByName(
  TARGET_DLL,
  "??1EncAndDesMediaFile@@QAE@XZ"
);

var EncAndDesMediaFileOpenAddr = Module.findExportByName(
  TARGET_DLL,
  "?Open@EncAndDesMediaFile@@QAE_NPB_W_N1@Z"
);

var EncAndDesMediaFileGetSizeAddr = Module.findExportByName(
  TARGET_DLL,
  "?GetSize@EncAndDesMediaFile@@QAEKXZ"
);

var EncAndDesMediaFileReadAddr = Module.findExportByName(
  TARGET_DLL,
  "?Read@EncAndDesMediaFile@@QAEKPAEK_J@Z"
);

// NOTE: only changed the constructor return type to 'void' (was "pointer").
// This prevents ABI/stack mismatch that can corrupt behavior.
var EncAndDesMediaFileConstructor = new NativeFunction(
  EncAndDesMediaFileConstructorAddr,
  "void",
  ["pointer"],
  "thiscall"
);

var EncAndDesMediaFileDestructor = new NativeFunction(
  EncAndDesMediaFileDestructorAddr,
  "void",
  ["pointer"],
  "thiscall"
);

var EncAndDesMediaFileOpen = new NativeFunction(
  EncAndDesMediaFileOpenAddr,
  "bool",
  ["pointer", "pointer", "bool", "bool"],
  "thiscall"
);

var EncAndDesMediaFileGetSize = new NativeFunction(
  EncAndDesMediaFileGetSizeAddr,
  "uint32",
  ["pointer"],
  "thiscall"
);

var EncAndDesMediaFileRead = new NativeFunction(
  EncAndDesMediaFileReadAddr,
  "uint32",
  ["pointer", "pointer", "uint32", "uint64"],
  "thiscall"
);

rpc.exports = {
  decrypt: function (srcFileName, tmpFileName) {
    // Basic input validation
    if (!srcFileName || typeof srcFileName !== "string") {
      throw new Error("Invalid srcFileName");
    }
    if (!tmpFileName || typeof tmpFileName !== "string") {
      throw new Error("Invalid tmpFileName");
    }

    var EncAndDesMediaFileObject = Memory.alloc(0x28);
    EncAndDesMediaFileConstructor(EncAndDesMediaFileObject);

    try {
      var fileNameUtf16 = Memory.allocUtf16String(srcFileName);

      // Check open result and give clearer error
      var opened = EncAndDesMediaFileOpen(
        EncAndDesMediaFileObject,
        fileNameUtf16,
        1,
        0
      );
      if (!opened) {
        throw new Error("Open failed for source file: " + srcFileName);
      }

      var fileSize = EncAndDesMediaFileGetSize(EncAndDesMediaFileObject);
      if (!fileSize || fileSize === 0) {
        throw new Error("File size is zero or could not be retrieved for: " + srcFileName);
      }

      var buffer = Memory.alloc(fileSize);

      var readBytes = EncAndDesMediaFileRead(
        EncAndDesMediaFileObject,
        buffer,
        fileSize,
        0
      );

      if (!readBytes || readBytes === 0) {
        throw new Error("Read returned 0 bytes for: " + srcFileName);
      }

      var data = buffer.readByteArray(readBytes);

      // Write to tmp file with robust error handling
      try {
        var tmpFile = new File(tmpFileName, "wb");
        // ensure data is not null
        if (data === null) {
          throw new Error("No data to write (read returned null)");
        }
        tmpFile.write(data);
        // Some environments support flush/close methods — call if present
        if (typeof tmpFile.flush === "function") {
          try { tmpFile.flush(); } catch (e) {}
        }
        if (typeof tmpFile.close === "function") {
          try { tmpFile.close(); } catch (e) {}
        }
      } catch (e) {
        // Convert low-level 'No such file or directory' into clearer message
        throw new Error("Failed to write tmp file '" + tmpFileName + "': " + e.message);
      }

      return true;
    } finally {
      // Always call destructor to avoid leaks/crashes
      try {
        EncAndDesMediaFileDestructor(EncAndDesMediaFileObject);
      } catch (e) {
        // ignore destructor errors but don't mask original errors
      }
    }
  },
};
