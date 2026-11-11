plugins { id("com.android.application") }

val edgeOneBaseUrl = providers.gradleProperty("ggEdgeOneBaseUrl")
    .orElse("https://gg-api.xn--8pv109c.top").get().trim().trimEnd('/')
val nativeVersionCode = providers.gradleProperty("ggNativeVersionCode")
    .orElse("17").get().toInt()
val nativeVersionName = providers.gradleProperty("ggNativeVersionName")
    .orElse("2.0.4-native-internal").get()
require(nativeVersionCode > 16) { "ggNativeVersionCode must advance beyond the previous APK" }
require(nativeVersionName.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,80}"))) {
    "ggNativeVersionName contains unsupported characters"
}
val internalStoreFile = System.getenv("GG_INTERNAL_KEYSTORE_FILE").orEmpty()
val internalStorePassword = System.getenv("GG_INTERNAL_STORE_PASSWORD").orEmpty()
val internalKeyAlias = System.getenv("GG_INTERNAL_KEY_ALIAS").orEmpty()
val internalKeyPassword = System.getenv("GG_INTERNAL_KEY_PASSWORD").orEmpty()
val internalSigningValues = listOf(internalStoreFile, internalStorePassword,
    internalKeyAlias, internalKeyPassword)
require(internalSigningValues.all { it.isNotBlank() } ||
    internalSigningValues.all { it.isBlank() }) {
    "Internal APK signing requires all four GG_INTERNAL_* environment variables"
}
val hasInternalSigning = internalSigningValues.all { it.isNotBlank() }
// Build an unsigned APK with the official signer policy already enabled.
// The owner's release JKS is applied later with apksigner on Windows.
val localOfficialUnsigned = providers.gradleProperty("ggLocalOfficialUnsigned")
    .orElse("false").get().toBooleanStrict()
require(!localOfficialUnsigned || !hasInternalSigning) {
    "Local official unsigned builds must not receive any CI signing credentials"
}
require(edgeOneBaseUrl.startsWith("https://") &&
    !edgeOneBaseUrl.contains('"') && !edgeOneBaseUrl.contains('\\') &&
    !edgeOneBaseUrl.contains('?') && !edgeOneBaseUrl.contains('#') &&
    !edgeOneBaseUrl.contains(' ')) { "ggEdgeOneBaseUrl must be a HTTPS origin" }

android {
    namespace = "com.jinli.ggsecure"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.jinli.quickweb.edgeonecpp"
        minSdk = 24
        targetSdk = 35
        versionCode = nativeVersionCode
        versionName = nativeVersionName
        buildConfigField("boolean", "EDGEONE_CANDIDATE", "true")
        buildConfigField("boolean", "GG_NATIVE_CORE", "true")
        // A debug-signed internal artifact remains usable for emulator tests.
        // Once official signing is configured, the APK enforces its pinned
        // certificate before issuing any license/runtime request.
        buildConfigField("boolean", "GG_REQUIRE_OFFICIAL_APK_SIGNER",
            (hasInternalSigning || localOfficialUnsigned).toString())
        buildConfigField("String", "EDGEONE_BASE_URL", "\"${edgeOneBaseUrl}\"")
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
        externalNativeBuild {
            cmake { cppFlags += "-std=c++17" }
        }
    }
    if (hasInternalSigning) {
        signingConfigs {
            create("ggInternal") {
                storeFile = file(internalStoreFile)
                storePassword = internalStorePassword
                keyAlias = internalKeyAlias
                keyPassword = internalKeyPassword
            }
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            // Local builds can use the Android debug key. CI can supply a
            // persistent, dedicated internal key to preserve upgrade identity.
            if (!localOfficialUnsigned) {
                signingConfig = signingConfigs.getByName(
                    if (hasInternalSigning) "ggInternal" else "debug")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),
                "../client/proguard-rules.pro", "proguard-rules.pro")
        }
    }
    sourceSets.getByName("main") {
        manifest.srcFile("../client/src/main/AndroidManifest.xml")
        java.srcDir("../client/src/main/java")
        res.srcDir("../client/src/main/res")
    }
    externalNativeBuild {
        cmake { path = file("src/main/cpp/CMakeLists.txt") }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true; lintConfig = file("../client/lint.xml") }
}

dependencies { implementation("androidx.webkit:webkit:1.16.0") }
