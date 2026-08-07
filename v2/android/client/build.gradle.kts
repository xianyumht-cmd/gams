plugins { id("com.android.application") }
android {
    namespace = "com.jinli.ggsecure"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.jinli.quickweb"
        minSdk = 24
        targetSdk = 35
        versionCode = 102
        versionName = "2.0.22-mobile-sheet-action-fix"
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
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

val patchProtocolAppVersion by tasks.registering {
    doLast {
        val manager = file("src/main/java/com/jinli/ggsecure/V2LicenseManager.java")
        val source = manager.readText()
        val baseline = "PROTOCOL_APP_VERSION = 12"
        val target = "PROTOCOL_APP_VERSION = 24"
        when {
            source.contains(baseline) -> manager.writeText(source.replace(baseline, target))
            source.contains(target) -> Unit
            else -> throw GradleException("Unexpected protocol app version baseline")
        }
    }
}

tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
    dependsOn(patchProtocolAppVersion)
}

dependencies { implementation("androidx.webkit:webkit:1.16.0") }
