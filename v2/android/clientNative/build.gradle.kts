plugins { id("com.android.application") }

val edgeOneBaseUrl = providers.gradleProperty("ggEdgeOneBaseUrl")
    .orElse("https://gg-api.xn--8pv109c.top").get().trim().trimEnd('/')
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
        versionCode = 16
        versionName = "2.0.3-native-internal"
        buildConfigField("boolean", "EDGEONE_CANDIDATE", "true")
        buildConfigField("boolean", "GG_NATIVE_CORE", "true")
        buildConfigField("String", "EDGEONE_BASE_URL", "\"${edgeOneBaseUrl}\"")
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
        externalNativeBuild {
            cmake { cppFlags += "-std=c++17" }
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("debug")
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
