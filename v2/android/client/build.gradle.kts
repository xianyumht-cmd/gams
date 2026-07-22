plugins { id("com.android.application") }
android {
    namespace = "com.jinli.ggsecure"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.jinli.ggsecure"
        minSdk = 24
        targetSdk = 35
        versionCode = 2
        versionName = "2.0.0-test2"
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("debug")
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
