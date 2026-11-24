plugins { id("com.android.application") }
val localNonameVersion = providers.gradleProperty("ggLocalNonameVersion").orElse("1.1.4").get()
require(localNonameVersion in setOf("1.4.1", "1.1.4", "1.1.3", "1.1.2")) {
    "Unsupported local JS test version: $localNonameVersion"
}
val localVariantCode = localNonameVersion.replace(".", "")
android {
    namespace = "com.jinli.ggsecure"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.jinli.quickweb"
        minSdk = 24
        targetSdk = 35
        versionCode = 16
        versionName = "2.0.3-stable"
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        create("localTest") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".localtest$localVariantCode"
            versionNameSuffix = "-local-$localNonameVersion"
            manifestPlaceholders["ggLocalTestLabel"] = "GG测试$localNonameVersion"
            isDebuggable = false
            isMinifyEnabled = false
            isShrinkResources = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true; lintConfig = file("lint.xml") }
}
dependencies { implementation("androidx.webkit:webkit:1.16.0") }
