package app.whatnext.addon

import android.os.Build
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Helpers for the Triple Sync lock: the phone's own fingerprint, face or screen-lock prompt, and a switch that hides the screen from screenshots
 * and from the recent-apps view while a private page is open. The PIN itself is handled by the app. Every method can fail; the app then simply
 * keeps using its PIN and the page stays visible to screenshots.
 */
@CapacitorPlugin(name = "WnLock")
class WnLockPlugin : Plugin() {

    // From Android 11 the phone's screen lock (PIN, pattern, password) is allowed next to fingerprint and face. Before that, only fingerprint and face.
    private fun authenticators(): Int {
        return if (Build.VERSION.SDK_INT >= 30) {
            BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        } else {
            BiometricManager.Authenticators.BIOMETRIC_WEAK
        }
    }

    @PluginMethod
    fun available(call: PluginCall) {
        val result = JSObject()
        try {
            val code = BiometricManager.from(context).canAuthenticate(authenticators())
            result.put("available", code == BiometricManager.BIOMETRIC_SUCCESS)
        } catch (e: Exception) {
            result.put("available", false)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun unlock(call: PluginCall) {
        val host = activity as? FragmentActivity
        if (host == null) {
            call.reject("unavailable")
            return
        }
        host.runOnUiThread {
            try {
                val prompt = BiometricPrompt(host, ContextCompat.getMainExecutor(context), object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        call.resolve()
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        call.reject("cancelled")
                    }
                })
                val info = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(call.getString("title") ?: "Unlock")
                    .setSubtitle(call.getString("subtitle"))
                    .setAllowedAuthenticators(authenticators())
                if (Build.VERSION.SDK_INT < 30) info.setNegativeButtonText("Use PIN")
                prompt.authenticate(info.build())
            } catch (e: Exception) {
                call.reject("unavailable")
            }
        }
    }

    @PluginMethod
    fun secure(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        activity.runOnUiThread {
            try {
                if (on) {
                    activity.window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
                } else {
                    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
                call.resolve()
            } catch (e: Exception) {
                call.reject("failed")
            }
        }
    }
}
