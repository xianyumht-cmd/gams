plugins { id("com.android.application") }
val edgeOneBaseUrl = providers.gradleProperty("ggEdgeOneBaseUrl").orElse("").get().trim()
require(edgeOneBaseUrl.isEmpty() || (edgeOneBaseUrl.startsWith("https://") &&
    !edgeOneBaseUrl.contains('"') && !edgeOneBaseUrl.contains('\\') &&
    !edgeOneBaseUrl.contains('?') && !edgeOneBaseUrl.contains('#') &&
    !edgeOneBaseUrl.contains(' '))) { "ggEdgeOneBaseUrl must be a HTTPS origin" }
android {
    namespace = "com.jinli.ggsecure"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.jinli.quickweb"
        minSdk = 24
        targetSdk = 35
        versionCode = 16
        versionName = "2.0.3-stable"
        buildConfigField("boolean", "EDGEONE_CANDIDATE", "false")
        buildConfigField("String", "EDGEONE_BASE_URL", "\"\"")
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        create("edgeOneTest") {
            initWith(getByName("release"))
            applicationIdSuffix = ".edgeonetest"
            versionNameSuffix = "-edgeone-internal"
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("boolean", "EDGEONE_CANDIDATE", "true")
            buildConfigField("String", "EDGEONE_BASE_URL", "\"${edgeOneBaseUrl.trimEnd('/')}\"")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true; lintConfig = file("lint.xml") }
}
dependencies { implementation("androidx.webkit:webkit:1.16.0") }
