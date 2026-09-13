package expo.modules.exactalarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Expose au JS la seule information que expo-notifications ne remonte pas :
// si l'app peut programmer des alarmes EXACTES sur Android (AlarmManager#canScheduleExactAlarms),
// et un moyen d'amener l'utilisateur au réglage système correspondant.
// Avant Android 12 (S), toute alarme est exacte par défaut : pas de restriction, pas d'écran à ouvrir.
class ExpoExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoExactAlarm")

    Function("canScheduleExactAlarms") {
      canScheduleExactAlarmsInternal()
    }

    Function<Unit>("openExactAlarmSettings") {
      val context = appContext.reactContext ?: return@Function
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function

      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      context.startActivity(intent)
    }
  }

  private fun canScheduleExactAlarmsInternal(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val context = appContext.reactContext ?: return false
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return alarmManager.canScheduleExactAlarms()
  }
}
